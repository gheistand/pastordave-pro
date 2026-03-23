# Mem0 Persistent Memory Integration
*Updated 2026-03-22 — fully working ✅*

Pastor Dave uses [Mem0](https://mem0.ai) to remember users across conversations — their name, prayer requests, spiritual journey, and preferences.

## How It Works

- **Memory store**: Mem0 API (`api.mem0.ai`)
- **User identifier**: Clerk user ID (`userId`) — each user's memories are scoped to their Clerk ID
- **Flow**: At the start of every conversation, the ElevenLabs agent calls `get_user_memory` to retrieve what it knows about the user. When the user shares something significant, the agent calls `save_user_memory` to persist it.

## Environment Variable

| Variable | Description |
|---|---|
| `MEM0_API_KEY` | Mem0 API key — set as a Cloudflare Pages secret |

## API Endpoints

Both endpoints are unauthenticated (called directly by ElevenLabs).

### GET `/api/tools/memory/:user_id`

Fetch memories for a user.

**Response:**
```json
{
  "memories": ["User's name is Sarah.", "Sarah requested prayer for her mother's health."],
  "count": 2
}
```

### POST `/api/tools/memory/:user_id`

Save a new memory for a user.

**Request body:**
```json
{ "memory": "User's name is Sarah and she is going through a divorce." }
```

**Response:**
```json
{ "success": true }
```

## Dynamic Variable: `user_id`

The `user_id` is passed to ElevenLabs as a **dynamic variable** when starting the conversation:

1. `el-token.js` returns `{ signed_url, user_id }` in its response
2. `app.js` reads `user_id` from the response and passes `dynamicVariables: { user_id }` to `Conversation.startSession()`
3. ElevenLabs substitutes `{{user_id}}` in tool URLs at runtime

## ElevenLabs Tool Definitions

Add these tools in the ElevenLabs agent dashboard under **Tools**:

### get_user_memory

```json
{
  "name": "get_user_memory",
  "description": "Get memories and context about this user from previous conversations. Call this at the start of every conversation.",
  "url": "https://pastordavepro.org/api/tools/memory/{{user_id}}",
  "method": "GET"
}
```

### save_user_memory

```json
{
  "name": "save_user_memory",
  "description": "Save an important memory about this user — their name, a prayer request, a life event, spiritual milestone, or preference they have shared. Call this whenever the user shares something worth remembering.",
  "url": "https://pastordavepro.org/api/tools/memory/{{user_id}}",
  "method": "POST",
  "parameters": {
    "type": "object",
    "properties": {
      "memory": {
        "type": "string",
        "description": "The memory to save — write it as a clear statement, e.g. \"User's name is Sarah and she is going through a divorce.\""
      }
    },
    "required": ["memory"]
  }
}
```

> **Note:** `{{user_id}}` is an ElevenLabs dynamic variable. It is populated at conversation start by the frontend via `dynamicVariables: { user_id }`.

## System Prompt Addition

Add the following to the ElevenLabs agent system prompt:

> At the start of every conversation, call `get_user_memory` with the `{{user_id}}` variable to retrieve what you know about this person. Reference their name and past conversations naturally — greet them by name if you know it, recall prayer requests, acknowledge spiritual milestones. When they share something significant (their name, a prayer request, a life event, a spiritual milestone, or a strong preference), call `save_user_memory` to remember it for future conversations.

---

## Working Configuration (as of 2026-03-22)

### Endpoint
`POST /api/tools/memory` — handles both get and save via `action` body param.

- `action: "get"` + `user_id` → returns memories array
- `action: "save"` (or `memory` field present) + `user_id` + `memory` → saves memory

### Why POST for both tools
ElevenLabs does not support dynamic variables in URL path segments. Using POST with body params avoids the `{{user_id}}` URL validation issue entirely.

### ElevenLabs Tool Config (WORKING)

**get_user_memory:**
- Method: POST
- URL: `https://pastordavepro.org/api/tools/memory`
- Body params: `user_id` (string, required), `action` (string, required, always "get")

**save_user_memory:**
- Method: POST
- URL: `https://pastordavepro.org/api/tools/memory`
- Body params: `user_id` (string, required), `memory` (string, required)

### System Prompt Addition (WORKING)
> At the start of every conversation, call `get_user_memory` to retrieve what you know about this person. If their name is in the memories, greet them by name warmly. Reference past prayer requests or conversations naturally — don't announce that you're reading from memory, just use it to be genuinely personal.
>
> As the conversation progresses, whenever the user shares something significant — their name, a prayer request, a life event, a spiritual milestone, or a strong preference — call `save_user_memory` immediately to preserve it for future conversations.
>
> For the `user_id` parameter in both tools, use the user_id value that was provided at the start of this conversation via dynamic variables. If no user_id was provided, use the value "anonymous".

### Tested Behavior
- Pastor Dave remembers user name across sessions ✅
- Pastor Dave remembers prayer requests, preferences, life events ✅
- Memories saved mid-conversation via `save_user_memory` ✅
- Memories retrieved at conversation start via `get_user_memory` ✅

### Dynamic Variable Flow
1. User logs in → Clerk user ID retrieved
2. `el-token.js` returns `{ signed_url, user_id }`
3. `app.js` passes `dynamicVariables: { user_id }` to `Conversation.startSession()`
4. ElevenLabs agent receives `user_id` as a dynamic variable
5. Agent passes `user_id` as body param when calling memory tools
