# Admin Dashboard — Pastor Dave Pro

The Church Pro admin dashboard is available at `/admin.html`. It requires Clerk authentication and a `church` tier account.

---

## Access

URL: `https://pastordavepro.org/admin.html`

**Authorized admins (New Horizon):**
- Glenn Heistand (primary admin)
- Sara Easter (church administrator)
- Pastor Mark Jordan

All admins must have a Pastor Dave Pro account with `tier=church` in D1. To promote a user:

```bash
npx wrangler d1 execute pastordave-pro --remote \
  --command "UPDATE users SET tier='church' WHERE id='user_xxxxxx';"
```

---

## Tabs

### Visitors
- Lists all visitor records captured by Pastor Dave during conversations
- Columns: Name, Email, Phone, Interest/Notes, Date
- Most recent first
- Source: `visitors` table in D1

### Pastoral Alerts
- Lists unresolved pastoral alerts
- Columns: Type/Severity, Situation summary, Visitor name (if known), Date
- "Mark Resolved" button per row → sets `resolved=1`
- Source: `pastoral_alerts` table in D1

### Sermons
- Lists all loaded sermons (title, pastor, date, series, scripture)
- Upload form at top: add new sermon directly from dashboard
- Fields: title, pastor, date, series, scripture, summary, key points (one per line), discussion questions (one per line)
- Alternative: use `scripts/load_sermon.py` for transcript-based AI summarization

### Stats
- Quick counts: total visitors, open alerts, resolved alerts, total sermons, pro users, church users

---

## Admin API Endpoints

All require `Authorization: Bearer <clerk_jwt>` header and `tier=church` account.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/visitors` | GET | List all visitors |
| `/api/admin/alerts` | GET | List all alerts |
| `/api/admin/alerts/resolve` | POST | Mark alert resolved `{ id }` |
| `/api/admin/sermons` | GET | List all sermons |
| `/api/admin/sermons` | POST | Create new sermon |
| `/api/admin/stats` | GET | Aggregate stats |

Auth middleware: `functions/api/admin/_admin_auth.js`
