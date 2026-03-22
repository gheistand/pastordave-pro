# Bulletin Auto-Fetch Cron Worker

Located in `workers/bulletin-cron/`. Runs every Monday at 10 AM UTC (5 AM Central) to automatically refresh each church's weekly bulletin from their website.

---

## How It Works

1. Queries D1 for all churches with a `bulletin_url` set
2. Fetches each URL, strips HTML tags/nav/header/footer
3. Stores clean text (up to 4,000 chars) in `churches.weekly_bulletin`
4. Pastor Dave's `get_church_profile` tool returns `weekly_bulletin` — AI instantly knows about current events

## Deploy

```bash
cd workers/bulletin-cron
npx wrangler deploy
```

## Manual Trigger (test without waiting for Monday)

```bash
curl https://pastordave-bulletin-cron.gheistand.workers.dev/run
```

Returns JSON with status per church:
```json
[{ "church": "New Horizon Church", "status": "updated", "chars": 4000 }]
```

## Setting Bulletin URL (per church)

In the admin dashboard → **Church Settings** → **Auto-Fetch URL** field.

NHC is pre-seeded with:
`https://newhorizonchurch.org/about-updates-calendar/weekly-updates`

## Schedule

`crons = ["0 10 * * 1"]` — Every Monday 10:00 AM UTC / 5:00 AM Central

## D1 Fields

- `churches.bulletin_url` — URL to fetch (set by admin)
- `churches.weekly_bulletin` — Fetched + cleaned text (updated by cron)

## Worker URL

`https://pastordave-bulletin-cron.gheistand.workers.dev`
