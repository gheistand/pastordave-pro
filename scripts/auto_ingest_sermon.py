#!/usr/bin/env python3
"""
Auto-ingest latest sermon from NHC Spreaker RSS feed into Pastor Dave Pro D1.

Workflow:
  1. Fetch Spreaker RSS feed
  2. Find episodes not yet in D1
  3. Submit MP3 URL directly to AssemblyAI (no download needed)
  4. Poll for transcription completion
  5. Summarize via Claude API
  6. Insert into D1 via wrangler

Usage:
    python3 scripts/auto_ingest_sermon.py [--dry-run] [--limit 1] [--church-id new-horizon-champaign] [--force]

Requirements:
    pip install requests anthropic assemblyai
    ASSEMBLYAI_API_KEY and ANTHROPIC_API_KEY in environment
"""

import argparse
import json
import os
import re
import subprocess
import sys
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

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', flush=True)


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

        if enclosure_el is None:
            continue

        title = title_el.text.strip() if title_el is not None else 'Unknown'
        mp3_url = enclosure_el.get('url', '')
        pub_date = pubdate_el.text.strip() if pubdate_el is not None else ''

        # Parse speaker from title: "Speaker Name | New Horizon Church | Month Day Year"
        parts = [p.strip() for p in title.split('|')]
        speaker = parts[0] if parts else 'Unknown'
        # If speaker looks like a sermon topic (no proper name pattern), mark as topic-only
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
        # Fix occasional RSS typos like 2926 → 2026
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


def get_existing_dates(church_id):
    """Get sermon dates already in D1"""
    result = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', DB_NAME, '--remote',
         '--command', f"SELECT date FROM sermons WHERE church_id = '{church_id}' ORDER BY date DESC LIMIT 20;"],
        capture_output=True, text=True, cwd=Path(__file__).parent.parent
    )
    existing = set()
    try:
        out = result.stdout
        idx = out.find('[')
        if idx >= 0:
            data = json.loads(out[idx:])
            for row in data[0].get('results', []):
                existing.add(row.get('date', ''))
    except Exception:
        pass
    return existing


def transcribe(mp3_url, assemblyai_key):
    """Submit URL to AssemblyAI REST API directly and poll for result"""
    log(f'Submitting to AssemblyAI: {mp3_url[:80]}...')
    headers = {'authorization': assemblyai_key, 'content-type': 'application/json'}

    # Submit job
    r = requests.post(
        'https://api.assemblyai.com/v2/transcript',
        json={'audio_url': mp3_url, 'speech_models': ['universal-2'], 'punctuate': True, 'format_text': True},
        headers=headers,
        timeout=30
    )
    r.raise_for_status()
    transcript_id = r.json()['id']
    log(f'Transcript ID: {transcript_id} — polling...')

    # Poll until complete
    poll_url = f'https://api.assemblyai.com/v2/transcript/{transcript_id}'
    while True:
        r = requests.get(poll_url, headers=headers, timeout=30)
        r.raise_for_status()
        data = r.json()
        status = data['status']
        if status == 'completed':
            text = data['text']
            log(f'Transcription complete: {len(text)} chars')
            return text
        elif status == 'error':
            raise RuntimeError(f'AssemblyAI error: {data.get("error")}')
        else:
            log(f'  Status: {status} — waiting 10s...')
            time.sleep(10)


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

    def esc(s):
        return str(s).replace("'", "''")

    key_points_json = esc(json.dumps(analysis['key_points']))
    discussion_questions_json = esc(json.dumps(analysis['discussion_questions']))
    summary = esc(analysis['summary'])
    transcript_escaped = esc(transcript[:8000])

    sql = (
        f"INSERT INTO sermons "
        f"(id, church_id, title, speaker, date, summary, key_points, discussion_questions, transcript, created_at) "
        f"VALUES ("
        f"'{sermon_id}', '{esc(church_id)}', '{esc(title)}', '{esc(speaker)}', '{esc(date)}', "
        f"'{summary}', '{key_points_json}', '{discussion_questions_json}', "
        f"'{transcript_escaped}', {created_at}"
        f");"
    )

    if dry_run:
        log(f'[DRY RUN] Would insert: {title} ({date})')
        log(f'Summary: {analysis["summary"][:120]}...')
        return sermon_id

    result = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', DB_NAME, '--remote', '--command', sql],
        capture_output=True, text=True,
        cwd=Path(__file__).parent.parent
    )

    if result.returncode != 0:
        log(f'ERROR inserting sermon: {result.stderr}')
        sys.exit(1)

    log(f'✅ Inserted: {title} ({date}) — ID: {sermon_id}')
    return sermon_id


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Auto-ingest latest NHC sermon')
    parser.add_argument('--dry-run', action='store_true', help='Skip D1 insert')
    parser.add_argument('--limit', type=int, default=1, help='Max episodes to process')
    parser.add_argument('--church-id', default=CHURCH_ID)
    parser.add_argument('--force', action='store_true', help='Re-process even if date exists in D1')
    args = parser.parse_args()

    assemblyai_key = os.environ.get('ASSEMBLYAI_API_KEY')
    anthropic_key = os.environ.get('ANTHROPIC_API_KEY')

    if not assemblyai_key:
        print('ERROR: ASSEMBLYAI_API_KEY not set')
        sys.exit(1)
    if not anthropic_key:
        print('ERROR: ANTHROPIC_API_KEY not set')
        sys.exit(1)

    claude = anthropic.Anthropic(api_key=anthropic_key)

    episodes = fetch_rss()
    existing = get_existing_dates(args.church_id) if not args.force else set()

    to_process = []
    for ep in episodes:
        if ep['date'] not in existing:
            to_process.append(ep)
        if len(to_process) >= args.limit:
            break

    if not to_process:
        log('No new episodes to process. All caught up!')
        return

    log(f'Processing {len(to_process)} new episode(s)')

    for ep in to_process:
        log(f'\n{"=" * 60}')
        log(f'Episode: {ep["title"]}')
        log(f'Speaker: {ep["speaker"]} | Date: {ep["date"]}')

        # Transcribe via AssemblyAI (URL-based, no download)
        transcript = transcribe(ep['mp3_url'], assemblyai_key)

        # Summarize via Claude
        analysis = summarize_sermon(transcript, ep['title'], ep['speaker'], claude)

        # Preview
        print('\n--- PREVIEW ---')
        print(f'Title:   {ep["title"]}')
        print(f'Speaker: {ep["speaker"]}')
        print(f'Date:    {ep["date"]}')
        print(f'Summary: {analysis["summary"]}')
        print('Key points:')
        for i, pt in enumerate(analysis['key_points'], 1):
            print(f'  {i}. {pt}')
        print('Discussion questions:')
        for i, q in enumerate(analysis['discussion_questions'], 1):
            print(f'  {i}. {q}')

        if not args.dry_run:
            confirm = input('\nInsert into D1? [y/N] ').strip().lower()
            if confirm != 'y':
                log('Skipped.')
                continue

        insert_sermon(args.church_id, ep['title'], ep['speaker'],
                     ep['date'], transcript, analysis, args.dry_run)

    log('\nDone!')


if __name__ == '__main__':
    main()
