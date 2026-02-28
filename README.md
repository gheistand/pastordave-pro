# Pastor Dave Pro

Paid tier of [askpastordave.org](https://askpastordave.org), deployed to `app.askpastordave.org`.

**Stack:** Cloudflare Pages + Pages Functions, Cloudflare D1, Clerk, Stripe, ElevenLabs.

---

## Prerequisites

| Service | What you need |
|---|---|
| Cloudflare | Account with Pages and D1 access |
| Clerk | Application created at [clerk.com](https://clerk.com) |
| Stripe | Account with Products/Prices created |
| ElevenLabs | Creator tier or above; a ConvAI agent created |

Install dependencies:

```bash
npm install
```

---

## 1. Create the D1 database

```bash
npx wrangler d1 create pastordave-pro
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "pastordave-pro"
database_id = "PASTE_YOUR_ID_HERE"
```

---

## 2. Run the database migration

Local (for `wrangler pages dev`):

```bash
npm run db:migrate
```

Remote (production):

```bash
npm run db:migrate:remote
```

---

## 3. Set Clerk publishable key in HTML

In all three HTML files (`public/index.html`, `public/app.html`, `public/pricing.html`), replace both occurrences of:

```
__CLERK_PUBLISHABLE_KEY__
```

with your Clerk publishable key (starts with `pk_`). Also set it in `wrangler.toml` under `[vars]`:

```toml
[vars]
CLERK_PUBLISHABLE_KEY = "pk_live_..."
```

---

## 4. Set secrets via Wrangler

Run each of the following and paste the value when prompted:

```bash
npx wrangler pages secret put CLERK_SECRET_KEY
npx wrangler pages secret put STRIPE_SECRET_KEY
npx wrangler pages secret put STRIPE_WEBHOOK_SECRET
npx wrangler pages secret put STRIPE_PRO_PRICE_ID
npx wrangler pages secret put STRIPE_CHURCH_PRICE_ID
npx wrangler pages secret put ELEVENLABS_API_KEY
npx wrangler pages secret put ELEVENLABS_AGENT_ID
```

**Where to find each value:**

- `CLERK_SECRET_KEY` — Clerk dashboard → API Keys → Secret key (`sk_live_...`)
- `STRIPE_SECRET_KEY` — Stripe dashboard → Developers → API keys → Secret key
- `STRIPE_WEBHOOK_SECRET` — See step 6 below
- `STRIPE_PRO_PRICE_ID` — Stripe dashboard → Products → your Pro product → Price ID (`price_...`)
- `STRIPE_CHURCH_PRICE_ID` — Same, for Church product
- `ELEVENLABS_API_KEY` — ElevenLabs dashboard → Profile → API key
- `ELEVENLABS_AGENT_ID` — ElevenLabs dashboard → ConvAI → your agent → Agent ID

---

## 5. Configure ElevenLabs agent authentication

1. Go to ElevenLabs → ConvAI → your agent → **Security** tab.
2. Enable **"Require authentication"** (signed URL / agent auth).
3. This ensures only your backend can start conversations — users cannot call the agent directly.
4. Copy the Agent ID and set it as `ELEVENLABS_AGENT_ID` (step 4).

---

## 6. Set up Stripe webhook

1. Go to Stripe dashboard → Developers → Webhooks → **Add endpoint**.
2. Endpoint URL: `https://app.askpastordave.org/api/webhooks/stripe`
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. After creating, reveal the **Signing secret** and set it:
   ```bash
   npx wrangler pages secret put STRIPE_WEBHOOK_SECRET
   ```

---

## 7. Deploy

```bash
npm run deploy
```

Wrangler will output a `*.pages.dev` preview URL. Test it there before pointing your domain.

---

## 8. Set up custom domain

1. In the Cloudflare dashboard, go to **Pages** → `pastordave-pro` → **Custom domains**.
2. Add `app.askpastordave.org`.
3. Cloudflare will automatically configure the DNS record (since your domain is already on Cloudflare).

---

## Local development

```bash
npm run dev
```

This starts `wrangler pages dev` serving `public/` as static files and `functions/` as API routes at `http://localhost:8788`.

For Stripe webhooks locally, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to http://localhost:8788/api/webhooks/stripe
```

Create a `.dev.vars` file for local secrets (never commit this file):

```
# .dev.vars
CLERK_SECRET_KEY=sk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_CHURCH_PRICE_ID=price_...
ELEVENLABS_API_KEY=...
ELEVENLABS_AGENT_ID=...
```

---

## Project structure

```
pastordave-pro/
├── public/
│   ├── index.html          # Landing / sign-in page
│   ├── app.html            # Authenticated app (ElevenLabs widget)
│   └── pricing.html        # Pricing page
├── functions/
│   └── api/
│       ├── el-token.js     # GET  — generate signed EL session token
│       ├── subscription.js # GET  — current user subscription status
│       ├── checkout.js     # POST — create Stripe Checkout session
│       └── webhooks/
│           └── stripe.js   # POST — Stripe webhook handler
├── src/
│   ├── auth.js             # Clerk frontend helpers (all pages)
│   ├── app.js              # App page logic
│   └── pricing.js          # Pricing page logic
├── migrations/
│   └── 0001_init.sql       # D1 schema
├── wrangler.toml
├── package.json
└── README.md
```

---

## Tier definitions

| Tier | Conversations | Price |
|---|---|---|
| free | 2 / day | $0 |
| pro | Unlimited | $8 / month |
| church | Unlimited | $39 / month |
