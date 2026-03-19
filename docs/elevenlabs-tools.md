# ElevenLabs Tools — Pastor Dave Pro

This document describes the API tools exposed for ElevenLabs Conversational AI agents.

---

## Tool 1: get_church_info

**GET** `/api/tools/church/:church_id`

Returns general information about the church (name, address, service times, contact info, etc.).

### Parameters

| Name | In | Required | Description |
|---|---|---|---|
| `church_id` | path | yes | Church slug (e.g. `new-horizon-champaign`) |

### Response

```json
{
  "id": "new-horizon-champaign",
  "name": "New Horizon Church",
  "address": "123 Main St, Champaign IL",
  "service_times": "Sundays at 9am and 11am",
  "phone": "...",
  "email": "...",
  "website": "..."
}
```

---

## Tool 2: capture_visitor

**POST** `/api/tools/visitor`

Captures a visitor's name and contact information and sends a notification email to the church.

### Request Body

```json
{
  "church_id": "new-horizon-champaign",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "217-555-0100",
  "notes": "Interested in small groups"
}
```

### Response

```json
{ "success": true, "message": "Visitor info saved" }
```

---

## Tool 3: get_latest_sermon

**GET** `/api/tools/sermon/:church_id`

Returns the most recent sermon for the church, including a summary, key points, and small group discussion questions. No authentication required — ElevenLabs calls this directly.

### Parameters

| Name | In | Required | Description |
|---|---|---|---|
| `church_id` | path | yes | Church slug (e.g. `new-horizon-champaign`) |

### Response (sermon found)

```json
{
  "id": "uuid",
  "title": "The Power of Words",
  "pastor": "Pastor Mark Jordan",
  "date": "2026-03-15",
  "series": "Living Well",
  "scripture": "James 3:1-12",
  "summary": "In this sermon, Pastor Mark explores how the words we speak shape our relationships and our walk with God...",
  "key_points": [
    "Our words carry the power of life and death (Proverbs 18:21).",
    "...",
    "...",
    "...",
    "..."
  ],
  "discussion_questions": [
    "Think of a time when words — your own or someone else's — had a significant impact. What happened?",
    "...",
    "...",
    "...",
    "..."
  ]
}
```

### Response (no sermons loaded)

```json
{ "message": "No sermons loaded yet" }
```

### Loading Sermons

Use `scripts/load_sermon.py` to load a sermon transcript into D1:

```bash
python3 scripts/load_sermon.py \
  --transcript /tmp/sermon_transcript.txt \
  --title "The Power of Words" \
  --pastor "Pastor Mark Jordan" \
  --date "2026-03-15" \
  --church-id "new-horizon-champaign" \
  --youtube-id "8K_BInk1qsQ"
```

The script calls the Anthropic API to generate the summary, key points, and discussion questions, previews the output, and prompts for confirmation before inserting into D1.

**Required env var:** `ANTHROPIC_API_KEY`
