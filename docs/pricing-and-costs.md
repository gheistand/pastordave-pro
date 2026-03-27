# Pastor Dave Pro — Pricing & Cost Structure

*Last updated: 2026-03-26*

---

## Subscription Tiers

| Tier | Monthly | Annual (save 17%) | Active Member Cap | Stripe Price ID |
|------|---------|-------------------|------------------|----------------|
| **Free** | $0 | — | N/A (3 convos/mo) | — |
| **Personal Pro** | $20/mo | $17/mo ($204/yr) | 1 user | `price_1TFEF1DPya0FZFALBzyG1IBV` |
| **Church Starter** | $149/mo | $124/mo ($1,488/yr) | 7 active members | `price_1TFQCIDPya0FZFALREVfkJqW` |
| **Church Growth** | $249/mo | $207/mo ($2,490/yr) | 25 active members | `price_1TFQDZDPya0FZFALgyB9XL2u` |

**Active member** = any user who has at least one conversation in the billing month.

---

## Stripe Product IDs

| Product | ID |
|---------|-----|
| Personal Pro | `prod_UDfaMh8qTUtw8j` |
| Church Starter ($149) | `prod_UDrwjKaNIMvRBy` |
| Church Growth ($249) | `prod_UDrxm3ziwZstk3` |

---

## Monthly Operating Cost Structure

### Direct Platform Costs (COGS)

| Service | Cost | Notes |
|---------|------|-------|
| API.Bible Pro | $29/mo | Commercial license required |
| API.Bible NLT Translation License | $10/mo | NLT copyrighted — required for commercial use |
| Cloudflare Workers Paid | $5/mo | Pages Functions, D1, Workers |
| Clerk Auth | $0 | Free up to 50K monthly retained users |
| Mem0 Memory API | $0 | Free tier (10K memories/mo) |
| Resend Email | $0 | Free tier (3K emails/mo) |
| AssemblyAI Transcription | $0 | Free tier (5 hrs/mo — covers 1 sermon/week) |
| Anthropic Claude | ~$0 | Pay-per-use, negligible at current scale |
| Stripe | 2.9% + $0.30/tx | Per transaction |
| **Fixed COGS subtotal** | **$44/mo** | Before ElevenLabs |

### ElevenLabs Voice AI (Variable — scales with active users)

| Plan | Cost | Active User Range | Credits |
|------|------|------------------|---------|
| Pro | $99/mo | 1–7 users | 500K |
| Scale | $330/mo | 8–28 users | 2M |
| Business | $1,320/mo | 29–150 users | 11M |

**⚠️ Pricing cliffs:**
- Adding user 8 triggers Scale plan: +$231/mo overnight
- Adding user 29 triggers Business plan: +$990/mo overnight

Active member caps per church tier are set to prevent unexpected cliff jumps:
- Church Starter: 7 members max → stays on Pro plan
- Church Growth: 25 members max → stays on Scale plan

### Business Overhead

| Item | Cost | Notes |
|------|------|-------|
| E&O + Cyber Insurance | $65/mo | Required before accepting payment |
| Legal Reserve | $15/mo | $180/yr for contracts/reviews |
| Illinois LLC Annual Report | $6/mo | $75/yr |
| Domains | $6/mo | ~$72/yr for 4+ domains |
| Misc | $18/mo | Buffer for small tools/expenses |
| **Overhead subtotal** | **$110/mo** | |

### True Operating Baseline

| Component | Monthly |
|-----------|---------|
| Fixed COGS | $44 |
| Business Overhead | $110 |
| ElevenLabs (NHC scale, ~5 active users) | $99 |
| **Total (at NHC scale)** | **$253/mo** |

---

## Break-Even Analysis

| Scenario | Revenue | Cost | Profit |
|---------|---------|------|--------|
| NHC free pilot | $0 | $253 | -$253 |
| 1 Church Starter + 5 PP | $249 | ~$262 | -$13 |
| **2 Church Starter + 10 PP** | **$498** | **~$272** | **+$226 ✓** |
| 5 Church Starter + 25 PP | $1,245 | ~$537 | +$708 |
| 10 Church Starter + 50 PP | $2,490 | ~$1,457 | +$1,033 |

**Tax:** Set aside 25-30% of profit for federal SE tax (15.3%) + IL state (4.95%).

---

## NHC Pilot Pricing

NHC is the founding pilot church. Recommended co-founder rate: **$49/mo** (should be implemented before end of April 2026).

---

## ElevenLabs Usage (NHC Pilot, Feb 26–Mar 26, 2026)

- Total credits: 352,694
- Total sessions: 179 successful
- Total voice minutes: 445 min
- Average session: 2.5 min (median 1.8 min)
- Cost: $99/mo (Pro plan, ~800 credits/minute)
- Active users: ~5

---

## Future: Vapi Migration Path

When ElevenLabs cliff at 8 active users approaches, consider migrating to **Vapi** (vapi.ai):
- True pay-per-minute: $0.15-0.25/min all-in
- Can use ElevenLabs voices (same quality)
- No pricing cliffs — pure linear scaling
- At NHC usage (445 min/mo): ~$67-112/mo vs. $99 flat
