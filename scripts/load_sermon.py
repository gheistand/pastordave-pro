#!/usr/bin/env python3
"""
Load a sermon transcript into Pastor Dave Pro's D1 database.

Usage:
    python3 scripts/load_sermon.py \
        --transcript /tmp/sermon_transcript.txt \
        --title "The Power of Words" \
        --pastor "Pastor Mark Jordan" \
        --date "2026-03-15" \
        --church-id "new-horizon-champaign" \
        --youtube-id "8K_BInk1qsQ"
"""

import argparse
import json
import os
import subprocess
import sys
import uuid
import time

import anthropic


def parse_args():
    parser = argparse.ArgumentParser(description="Load a sermon into D1 via wrangler")
    parser.add_argument("--transcript", required=True, help="Path to plain text transcript file")
    parser.add_argument("--title", required=True, help="Sermon title")
    parser.add_argument("--pastor", required=True, help="Pastor name")
    parser.add_argument("--date", required=True, help="Sermon date (YYYY-MM-DD)")
    parser.add_argument("--church-id", required=True, help="Church slug/ID")
    parser.add_argument("--youtube-id", default="", help="YouTube video ID (optional)")
    parser.add_argument("--series", default="", help="Sermon series name (optional)")
    parser.add_argument("--scripture", default="", help="Scripture reference (optional)")
    return parser.parse_args()


def summarize_sermon(transcript, title, pastor):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""You are analyzing a church sermon transcript. Based on this sermon, provide:
1. A 3-4 sentence summary suitable for a church AI assistant to share with interested visitors
2. Five key points or themes from the sermon (concise, 1-2 sentences each)
3. Five discussion questions for small groups

Sermon title: {title}
Pastor: {pastor}

Transcript:
{transcript[:8000]}

Respond in JSON format:
{{
  "summary": "...",
  "key_points": ["...", "...", "...", "...", "..."],
  "discussion_questions": ["...", "...", "...", "...", "..."]
}}"""

    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


def insert_sermon(church_id, title, pastor, date, series, scripture, youtube_id, transcript, analysis):
    sermon_id = str(uuid.uuid4())
    created_at = int(time.time())

    key_points_json = json.dumps(analysis["key_points"]).replace("'", "''")
    discussion_questions_json = json.dumps(analysis["discussion_questions"]).replace("'", "''")
    summary = analysis["summary"].replace("'", "''")
    transcript_escaped = transcript.replace("'", "''")
    title_escaped = title.replace("'", "''")
    pastor_escaped = pastor.replace("'", "''")
    series_escaped = series.replace("'", "''")
    scripture_escaped = scripture.replace("'", "''")

    sql = (
        f"INSERT INTO sermons "
        f"(id, church_id, title, pastor, date, series, scripture, transcript, summary, key_points, discussion_questions, youtube_id, created_at) "
        f"VALUES ("
        f"'{sermon_id}', '{church_id}', '{title_escaped}', '{pastor_escaped}', '{date}', "
        f"'{series_escaped}', '{scripture_escaped}', '{transcript_escaped[:8000]}', '{summary}', "
        f"'{key_points_json}', '{discussion_questions_json}', '{youtube_id}', {created_at}"
        f");"
    )

    result = subprocess.run(
        ["wrangler", "d1", "execute", "pastordave-db", "--remote", "--command", sql],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print("ERROR: wrangler d1 execute failed", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)

    return sermon_id


def main():
    args = parse_args()

    with open(args.transcript, "r", encoding="utf-8") as f:
        transcript = f.read()

    print(f"\nAnalyzing sermon: {args.title}")
    print("Calling Claude API...\n")

    analysis = summarize_sermon(transcript, args.title, args.pastor)

    print("=== GENERATED CONTENT ===\n")
    print(f"Summary:\n{analysis['summary']}\n")
    print("Key Points:")
    for i, point in enumerate(analysis["key_points"], 1):
        print(f"  {i}. {point}")
    print("\nDiscussion Questions:")
    for i, q in enumerate(analysis["discussion_questions"], 1):
        print(f"  {i}. {q}")
    print("\n=========================\n")

    confirm = input("Insert this sermon into D1? [y/N] ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        sys.exit(0)

    sermon_id = insert_sermon(
        church_id=args.church_id,
        title=args.title,
        pastor=args.pastor,
        date=args.date,
        series=args.series,
        scripture=args.scripture,
        youtube_id=args.youtube_id,
        transcript=transcript,
        analysis=analysis,
    )

    print(f"\nSermon inserted successfully! ID: {sermon_id}")


if __name__ == "__main__":
    main()
