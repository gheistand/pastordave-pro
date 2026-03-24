# Discipleship Group Tools

*Built 2026-03-24 | Church-tier only*

## Overview

A two-part feature for discipleship group leaders at NHC (and any church using Pastor Dave Pro):

1. **Weekly Discussion Guide Generator** — AI-generated Head/Heart/Hands guide synthesizing the Sunday sermon with the week's One Year Bible readings
2. **Meeting Agenda Builder** — Time-stamped printable/shareable agenda from the guide

## Access

- Requires Clerk authentication + `tier === "church"` in user metadata
- Route: `/discipleship-group.html` (linked from Discipleship Group tab in app.html)

## Head / Heart / Hands Framework

| Section | Color | Question | Purpose |
|---------|-------|----------|---------|
| HEAD | Blue (#3b82f6) | "What does God's Word say?" | Exegesis & teaching |
| HEART | Red (#ef4444) | "What does this mean for me?" | Reflection & vulnerability |
| HANDS | Green (#22c55e) | "What will I do about it?" | Action & accountability |

## Architecture

### Pages
- `public/discipleship-group.html` — single-page app with 5 tabs
- `public/src/discipleship-group.js` — all client-side logic

### API Endpoints (`/api/discipleship-group/`)
| File | Method | Purpose |
|------|--------|---------|
| `profile.js` | GET/POST | Group profile CRUD |
| `sermon-for-week.js` | GET | Most recent Sunday sermon for a given date |
| `tyndale-readings.js` | GET | 7-day reading window from bible_reading_plan |
| `generate-guide.js` | POST | AI guide generation via Claude |
| `save-guide.js` | POST | Persist guide to D1 |
| `guides.js` | GET | List saved guides |
| `build-agenda.js` | POST | Assemble time-stamped agenda markdown |
| `save-agenda.js` | POST | Persist agenda + generate share_token |
| `agendas.js` | GET | List saved agendas |
| `agenda-share/[token].js` | GET | Public read-only agenda by share token |

### D1 Tables

**group_profiles**
```sql
id TEXT PRIMARY KEY, user_id, church_id, group_name, group_description,
group_type, leader_name, meeting_day, meeting_time, meeting_location,
default_meeting_length INTEGER DEFAULT 75, bible_translation TEXT DEFAULT 'NLT',
follow_tyndale INTEGER DEFAULT 1, use_hhh_framework INTEGER DEFAULT 1,
created_at INTEGER, updated_at INTEGER
```

**discussion_guides**
```sql
id TEXT PRIMARY KEY, user_id, group_profile_id, church_id, meeting_date,
week_theme, sermon_id, sermon_title, sermon_scripture, sermon_summary,
reading_window_start, reading_window_end, readings_json TEXT,
meeting_length INTEGER, guide_json TEXT, guide_markdown TEXT, created_at INTEGER
```

**meeting_agendas**
```sql
id TEXT PRIMARY KEY, user_id, group_profile_id, discussion_guide_id,
meeting_date, meeting_location, leader_name, opening_prayer_leader,
closing_prayer_leader, worship_song, announcements, next_week_preview,
agenda_markdown TEXT, share_token TEXT UNIQUE, created_at INTEGER
```

**sermons (existing + new column)**
```sql
-- New optional column:
reading_theme TEXT  -- Staff-authored OT/NT bridge for AI prompt
```

## D1 Schema Mapping (actual vs SimTheory spec)

The SimTheory spec used different column names than the actual D1 schema. All code uses actual names:

| Spec | Actual | Notes |
|------|--------|-------|
| `tyndale_readings` | `bible_reading_plan` | Different table name |
| `ot_passage` | `old_testament` | |
| `nt_passage` | `new_testament` | |
| `psalm_passage` | `psalm` | |
| `proverb_passage` | `proverbs` | |
| `sermon_date` | `date` | |
| `sermon_title` | `title` | |
| `scripture_reference` | `scripture` | |
| `sermon_summary` | `summary` | |

## Reading Window Logic

Given a group's `meeting_day` (e.g., "Tuesday") and today's date:
1. Find last occurrence of that weekday
2. Reading window = day after last meeting → today (7 days)
3. Query `bible_reading_plan` WHERE `(month, day)` falls within window

## AI Guide Generation

- Model: `claude-haiku-4-5` via Anthropic API
- API key: `ANTHROPIC_API_KEY` (Cloudflare Pages secret)
- Key Verse: Claude selects the reference; actual text fetched via `/api/tools/scripture`
- Sermon data: pulled from D1 `sermons` table — AI does NOT generate sermon content
- `reading_theme` (if set): injected as authoritative OT/NT bridge; otherwise AI derives it

## Agenda Timing

Auto-calculated for 60/75/90 min meeting lengths:
- Welcome & Prayer → Check-In → HEAD → HEART → HANDS → Accountability → Announcements → Next Week

## Sharing

Agendas generate a unique `share_token` (crypto.randomUUID()).
Public URL: `/discipleship-group/agenda/share/[token]` — no auth required.
