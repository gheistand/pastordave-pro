#!/usr/bin/env python3
"""
Auto-ingest latest sermon from NHC Spreaker RSS feed into Pastor Dave Pro D1.

Workflow:
  1. Fetch Spreaker RSS feed
  2. Find episodes not yet in D1
  3. Download MP3, split into <25MB chunks via ffmpeg
  4. Transcribe each chunk via OpenAI Whisper API
  5. Summarize via Claude API
  6. Insert into D1 via wrangler

Usage:
    python3 scripts/auto_ingest_sermon.py [--dry-run] [--limit 1] [--church-id new-horizon-champaign]

Requirements:
    pip install requests anthropic
    brew install ffmpeg
    OPENAI_API_KEY and ANTHROPIC_API_KEY in environment
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

import requests
import anthropic

# ── Config ────────────────────────────────────────────────────────────────────

RSS_URL = 'https://www.spreaker.com/show/4952985/episodes/feed'
CHURCH_ID = 'new-horizon-champaign'
DB_NAME = 'pastordave-pro'
CHUNK_SIZE_MB = 20  # Keep under 25MB Whisper limit
WHISPER_MODEL = 'whisper-1'

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}')


def fetch_rss():
    log('Fetching RSS feed...')
    r = requests.get(RSS_URL, timeout=30)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    ns = {'itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd'}

    episodes = []
    for item in root.findall('.//item'):
        title_el = item.find('title')
        pubdate_el = item.find('pubDate')
        enclosure_el = item.find('enclosure')
        duration_el = item.find('itunes:duration', ns)

        if enclosure_el is None:
            continue

        title = title_el.text.strip() if title_el is not None else 'Unknown'
        mp3_url = enclosure_el.get('url', '')
        pub_date = pubdate_el.text.strip() if pubdate_el is not None else ''

        # Parse speaker and date from title: "Speaker Name | New Horizon Church | Month Day Year"
        speaker = title.split('|')[0].strip() if '|' in title else 'Unknown'
        # Try to parse date from title
        date_str = parse_date_from_title(title, pub_date)

        episodes.append({
            'title': title,
            'speaker': speaker,
            'date': date_str,
            'mp3_url': mp3_url,
            'pub_date': pub_date,
        })

    log(f'Found {len(episodes)} episodes in RSS feed')
    return episodes


def parse_date_from_title(title, pub_date_fallback):
    """Extract YYYY-MM-DD from title like '... | March 15th 2026'"""
    # Try to match month day year at end of title
    months = {
        'january': '01', 'february': '02', 'march': '03', 'april': '04',
        'may': '05', 'june': '06', 'july': '07', 'august': '08',
        'september': '09', 'october': '10', 'november': '11', 'december': '12'
    }
    pattern = r'(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d+)(?:st|nd|rd|th)?\s+(\d{4})'
    m = re.search(pattern, title.lower())
    if m:
        month = months[m.group(1)]
        day = m.group(2).zfill(2)
        year = m.group(3)
        # Fix RSS feed typo: 2926 → 2026
        if int(year) > 2030:
            year = str(int(year) - 900)
        return f'{year}-{month}-{day}'

    # Fallback: parse pub_date (e.g. "Wed, 18 Mar 2026 13:00:02 +0000")
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(pub_date_fallback)
        return dt.strftime('%Y-%m-%d')
    except Exception:
        return datetime.now().strftime('%Y-%m-%d')


def get_existing_sermons(church_id):
    """Get sermon dates/titles already in D1"""
    result = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', DB_NAME, '--remote',
         '--command', f"SELECT title, date FROM sermons WHERE church_id = '{church_id}' ORDER BY date DESC LIMIT 20;"],
        capture_output=True, text=True, cwd=Path(__file__).parent.parent
    )
    existing = set()
    try:
        # Parse wrangler JSON output
        lines = result.stdout
        data = json.loads(lines[lines.index('['):])
        for row in data[0].get('results', []):
            existing.add(row.get('date', ''))
            existing.add(row.get('title', '').lower()[:30])
    except Exception:
        pass
    return existing


def download_mp3(url, dest_path):
    log(f'Downloading MP3: {url[:80]}...')
    r = requests.get(url, stream=True, timeout=120)
    r.raise_for_status()
    total = 0
    with open(dest_path, 'wb') as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
            total += len(chunk)
    log(f'Downloaded {total / 1024 / 1024:.1f} MB')
    return dest_path


def split_audio(mp3_path, chunk_dir, chunk_size_mb=20):
    """Split MP3 into chunks using ffmpeg"""
    log(f'Splitting audio into ~{chunk_size_mb}MB chunks...')

    # Get duration in seconds
    result = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', mp3_path],
        capture_output=True, text=True
    )
    duration = float(json.loads(result.stdout)['format']['duration'])
    file_size = os.path.getsize(mp3_path)
    bytes_per_sec = file_size / duration
    chunk_secs = int((chunk_size_mb * 1024 * 1024) / bytes_per_sec)

    chunks = []
    start = 0
    i = 0
    while start < duration:
        chunk_path = os.path.join(chunk_dir, f'chunk_{i:03d}.mp3')
        subprocess.run([
            'ffmpeg', '-y', '-i', mp3_path,
            '-ss', str(start), '-t', str(chunk_secs),
            '-acodec', 'copy', chunk_path
        ], capture_output=True)
        if os.path.exists(chunk_path) and os.path.getsize(chunk_path) > 0:
            chunks.append(chunk_path)
            log(f'  Chunk {i}: {os.path.getsize(chunk_path)/1024/1024:.1f}MB')
        start += chunk_secs
        i += 1

    log(f'Split into {len(chunks)} chunks')
    return chunks


def transcribe_chunks(chunks, openai_key):
    """Transcribe each chunk via OpenAI Whisper API"""
    log('Transcribing with Whisper...')
    full_transcript = []

    for i, chunk_path in enumerate(chunks):
        log(f'  Transcribing chunk {i+1}/{len(chunks)}...')
        for attempt in range(5):
            with open(chunk_path, 'rb') as f:
                response = requests.post(
                    'https://api.openai.com/v1/audio/transcriptions',
                    headers={'Authorization': f'Bearer {openai_key}'},
                    files={'file': (os.path.basename(chunk_path), f, 'audio/mpeg')},
                    data={'model': WHISPER_MODEL, 'response_format': 'text'}
                )
            if response.status_code == 429:
                wait = 30 * (attempt + 1)
                log(f'  Rate limited — waiting {wait}s before retry {attempt+1}/5...')
                time.sleep(wait)
                continue
            response.raise_for_status()
            break
        text = response.text.strip()
        full_transcript.append(text)
        log(f'  Chunk {i+1}: {len(text)} chars transcribed')
        if i < len(chunks) - 1:
            time.sleep(5)  # small delay between chunks

    return ' '.join(full_transcript)


def summarize_sermon(transcript, title, speaker, client):
    """Use Claude to generate summary, key points, discussion questions"""
    log('Generating summary with Claude...')

    prompt = f"""You are analyzing a church sermon transcript. Based on this sermon, provide:
1. A 3-4 sentence summary suitable for a church AI assistant to share with interested visitors
2. Five key points or themes from the sermon (concise, 1-2 sentences each)
3. Five discussion questions for small groups

Sermon title: {title}
Speaker: {speaker}

Transcript:
{transcript[:8000]}

Respond in JSON format:
{{
  "summary": "...",
  "key_points": ["...", "...", "...", "...", "..."],
  "discussion_questions": ["...", "...", "...", "...", "..."]
}}"""

    message = client.messages.create(
        model='claude-haiku-4-5',
        max_tokens=1024,
        messages=[{'role': 'user', 'content': prompt}],
    )
    raw = message.content[0].text.strip()
    if raw.startswith('```'):
        raw = raw.split('```')[1]
        if raw.startswith('json'):
            raw = raw[4:]
    return json.loads(raw)


def insert_sermon(church_id, title, speaker, date, transcript, analysis, dry_run):
    sermon_id = str(uuid.uuid4())
    created_at = int(time.time())

    key_points_json = json.dumps(analysis['key_points']).replace("'", "''")
    discussion_questions_json = json.dumps(analysis['discussion_questions']).replace("'", "''")
    summary = analysis['summary'].replace("'", "''")
    transcript_escaped = transcript[:8000].replace("'", "''")
    title_escaped = title.replace("'", "''")
    speaker_escaped = speaker.replace("'", "''")

    sql = (
        f"INSERT INTO sermons "
        f"(id, church_id, title, speaker, date, summary, key_points, discussion_questions, transcript, created_at) "
        f"VALUES ("
        f"'{sermon_id}', '{church_id}', '{title_escaped}', '{speaker_escaped}', '{date}', "
        f"'{summary}', '{key_points_json}', '{discussion_questions_json}', "
        f"'{transcript_escaped}', {created_at}"
        f");"
    )

    if dry_run:
        log(f'[DRY RUN] Would insert sermon: {title} ({date})')
        log(f'Summary: {analysis["summary"][:100]}...')
        return sermon_id

    result = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', DB_NAME, '--remote', '--command', sql],
        capture_output=True, text=True,
        cwd=Path(__file__).parent.parent
    )

    if result.returncode != 0:
        log(f'ERROR: {result.stderr}')
        sys.exit(1)

    log(f'✅ Sermon inserted: {title} ({date}) — ID: {sermon_id}')
    return sermon_id


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Auto-ingest latest NHC sermon')
    parser.add_argument('--dry-run', action='store_true', help='Skip D1 insert, just preview')
    parser.add_argument('--limit', type=int, default=1, help='Max episodes to process (default: 1)')
    parser.add_argument('--church-id', default=CHURCH_ID)
    parser.add_argument('--force', action='store_true', help='Re-process even if already in D1')
    args = parser.parse_args()

    openai_key = os.environ.get('OPENAI_API_KEY')
    anthropic_key = os.environ.get('ANTHROPIC_API_KEY')

    if not openai_key:
        print('ERROR: OPENAI_API_KEY not set')
        sys.exit(1)
    if not anthropic_key:
        print('ERROR: ANTHROPIC_API_KEY not set')
        sys.exit(1)

    claude = anthropic.Anthropic(api_key=anthropic_key)

    # Get RSS feed and existing sermons
    episodes = fetch_rss()
    existing = get_existing_sermons(args.church_id) if not args.force else set()

    # Find new episodes
    to_process = []
    for ep in episodes:
        if ep['date'] not in existing and ep['title'].lower()[:30] not in existing:
            to_process.append(ep)
        if len(to_process) >= args.limit:
            break

    if not to_process:
        log('No new episodes to process. All caught up!')
        return

    log(f'Processing {len(to_process)} new episode(s)')

    for ep in to_process:
        log(f'\n{"="*60}')
        log(f'Episode: {ep["title"]}')
        log(f'Speaker: {ep["speaker"]} | Date: {ep["date"]}')

        with tempfile.TemporaryDirectory() as tmpdir:
            mp3_path = os.path.join(tmpdir, 'sermon.mp3')
            chunk_dir = os.path.join(tmpdir, 'chunks')
            os.makedirs(chunk_dir)

            # Download
            download_mp3(ep['mp3_url'], mp3_path)

            # Split
            chunks = split_audio(mp3_path, chunk_dir, CHUNK_SIZE_MB)

            # Transcribe
            transcript = transcribe_chunks(chunks, openai_key)
            log(f'Total transcript: {len(transcript)} chars')

            # Summarize
            analysis = summarize_sermon(transcript, ep['title'], ep['speaker'], claude)
            log(f'Summary generated: {analysis["summary"][:80]}...')

            # Preview
            print('\n--- PREVIEW ---')
            print(f'Title:   {ep["title"]}')
            print(f'Speaker: {ep["speaker"]}')
            print(f'Date:    {ep["date"]}')
            print(f'Summary: {analysis["summary"]}')
            print('Key points:')
            for i, pt in enumerate(analysis['key_points'], 1):
                print(f'  {i}. {pt}')

            if not args.dry_run:
                confirm = input('\nInsert into D1? [y/N] ').strip().lower()
                if confirm != 'y':
                    log('Skipped.')
                    continue

            # Insert
            insert_sermon(args.church_id, ep['title'], ep['speaker'],
                         ep['date'], transcript, analysis, args.dry_run)

    log('\nDone!')


if __name__ == '__main__':
    main()
