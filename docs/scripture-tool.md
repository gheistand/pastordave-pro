# Scripture Lookup Tool

Pastor Dave fetches exact Bible text from API.Bible — no LLM-generated Scripture, no hallucinated verses.

## How It Works

1. User asks for a verse or Pastor Dave wants to quote Scripture
2. ElevenLabs agent calls `get_scripture` tool
3. Backend fetches exact text from API.Bible in the church's configured translation
4. Agent quotes the returned text verbatim

## Endpoint

`GET /api/tools/scripture`

**Query params:**
| Param | Required | Description |
|-------|----------|-------------|
| `reference` | Yes | e.g. `John 3:16`, `Romans 8:28-30`, `Psalm 23` |
| `translation` | No | NLT, NIV, KJV — defaults to church's configured translation |
| `church_id` | No | Defaults to `new-horizon-champaign` |

**Response:**
```json
{
  "reference": "John 3:16",
  "translation": "NLT",
  "text": "For this is how God loved the world: He gave his one and only Son...",
  "found": true,
  "instruction": "Quote this text EXACTLY as provided..."
}
```

## Translation IDs (API.Bible)

| Translation | ID |
|-------------|-----|
| NLT | d6e14a625393b4da-01 |
| NIV | 78a9f6124f344018-01 |
| KJV | 55212e3cf5d04d49-01 |

## Church Translation Configuration

Set per-church in `churches.bible_translation`. NHC is configured for **NLT** (aligned with Bible in a Year study).

To change: Admin Dashboard → Church Settings → Bible Translation (future UI field) or:
```sql
UPDATE churches SET bible_translation = 'NIV' WHERE id = 'your-church-id';
```

## ElevenLabs Tool Definition

```json
{
  "name": "get_scripture",
  "description": "Fetch the exact text of a Bible verse or passage. ALWAYS use this tool when quoting Scripture. Never generate or paraphrase Bible text.",
  "url": "https://pastordavepro.org/api/tools/scripture",
  "method": "GET",
  "parameters": {
    "reference": { "type": "string", "description": "Bible reference e.g. John 3:16" },
    "translation": { "type": "string", "description": "Optional: NLT, NIV, KJV" }
  }
}
```

## System Prompt Addition

> When the user asks about a Bible verse or when you want to quote Scripture, call `get_scripture` to retrieve the exact text. Quote the `text` field verbatim — word for word. Do not paraphrase or generate Bible text from your own training. Always state the reference and translation after quoting. If the tool fails, say "I wasn't able to retrieve that passage — please look it up in your Bible."

## API Key

`BIBLE_API_KEY` — stored as Cloudflare Pages secret
API base: `https://rest.api.bible/v1`
