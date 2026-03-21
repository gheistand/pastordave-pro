# ElevenLabs Tools — Pastor Dave Pro

This document describes the API tools exposed for ElevenLabs Conversational AI agents.

All tool endpoints are unauthenticated (called directly by ElevenLabs — no user JWT required).

---

## Tool 1: get_church_profile

**GET** `/api/tools/church/:church_id`

Returns the full church profile including name, pastor, mission, service times, contact info, next steps, and connect card process.

### Parameters

| Name | In | Required | Description |
|---|---|---|---|
| `church_id` | path | yes | Church slug (e.g. `new-horizon-champaign`) |

### Response

```json
{
  "id": "new-horizon-champaign",
  "name": "New Horizon Church",
  "pastor": "Pastor Mark Jordan",
  "denomination": "Global Methodist Church",
  "mission": "Love God, Love Others & Make Disciples",
  "address": "3002 W. Bloomington Rd., Champaign, IL 61822",
  "phone": "217-359-8909",
  "email": "Info@NewHorizonChurch.org",
  "website": "https://newhorizonchurch.org",
  "service_times": "Sundays at 10:30 AM",
  "next_steps": ["...", "..."],
  "connect_card_contact": "Sara Easter (church administrator) will follow up personally"
}
```

---

## Tool 2: create_visitor_record

**POST** `/api/tools/visitor/:church_id`

Captures a visitor's name and contact info, saves to D1, and sends a notification email to the church admin (Sara Easter at New Horizon).

### Request Body

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "217-555-0100",
  "interest": "Interested in small groups"
}
```

### Response

```json
{ "success": true, "id": "uuid" }
```

---

## Tool 3: get_latest_sermon

**GET** `/api/tools/sermon/:church_id`

Returns the most recent sermon including summary, key points, and small group discussion questions.

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
  "summary": "...",
  "key_points": ["...", "...", "..."],
  "discussion_questions": ["...", "...", "..."]
}
```

### Response (no sermons loaded)

```json
{ "message": "No sermons loaded yet" }
```

### Loading Sermons

Use `scripts/load_sermon.py` to load a sermon into D1:

```bash
python3 scripts/load_sermon.py \
  --transcript /tmp/sermon_transcript.txt \
  --title "The Power of Words" \
  --pastor "Pastor Mark Jordan" \
  --date "2026-03-15" \
  --church-id "new-horizon-champaign" \
  --youtube-id "8K_BInk1qsQ"
```

The script calls the Anthropic API to generate summary, key points, and discussion questions, previews output, and prompts for confirmation before inserting into D1.

**Required env var:** `ANTHROPIC_API_KEY`

---

## Tool 4: raise_pastoral_alert

**POST** `/api/tools/alert/:church_id`

Flags a crisis or pastoral concern. Sends email (Resend) + SMS (Twilio) to the pastoral team immediately.

### Request Body

```json
{
  "situation": "User expressed thoughts of self-harm",
  "severity": "crisis",
  "first_name": "Jane"
}
```

### Response

```json
{
  "success": true,
  "alert_id": "uuid",
  "message": "I've notified the pastoral team. You are not alone, and help is on the way."
}
```

**New Horizon routing:**
- Email → `PASTORAL_ALERT_EMAIL` env var
- SMS → `PASTORAL_ALERT_PHONE` env var (Pastor Mark Jordan's cell)

