# LittleJohn infra — the control pattern

Goal: project infra lives in **separate accounts** from your personal life (anon
compartmentalization), and I operate them via CLIs that read **scoped tokens from a
local `.env`** — tokens never enter this chat, same model as the deployer key.

## Accounts (all created by you, project email, hardware-key 2FA)
| Service | Purpose | I control it via |
|---|---|---|
| Cloudflare | Pages hosting + DNS + backend (Workers/D1/KV/R2) for littlejo.hn | `wrangler` + CF API (token in `.env`) |
| Supabase (optional) | Postgres backend, only if we prefer it over CF D1 | `supabase` CLI or Supabase MCP |
| Njalla | domain registrar (already done) | you (registrar stays manual — it's the root of trust) |

### Backend decision: Cloudflare-native vs Supabase
The Cloudflare token below is scoped for **Workers + D1 + KV + R2**, which means the whole
points/leaderboard/referral backend can run entirely on Cloudflare — one vendor, one token,
all under your control. Supabase (Postgres) is more flexible for complex relational queries,
but for a leaderboard + Merkle proofs + referral counts, Cloudflare-native is plenty and
cleaner. Priming the scope keeps both open; we pick when we build the scorer/points API.

Rule: **the registrar (Njalla) stays 100% manual and hardware-2FA'd.** It's the top
of the trust chain; no API token for it, ever. Everything downstream (DNS, hosting)
can be token-driven because it's recoverable from the registrar if compromised.

## One-time setup (you)
1. Create a Cloudflare account with the **project email** (not personal). Turn on
   hardware-key 2FA immediately — this account will control DNS, which is the #1
   DeFi attack surface (see the MM Finance $2M DNS hijack).
2. Create a **scoped** API token — exact permission list is in `.env.example`
   (Pages/DNS/Workers/KV/R2/D1/Turnstile/Cache-Purge). NOT the Global API Key, and
   NOT account-admin/security scopes (those stay manual behind your hardware key).
3. `cp .env.example .env` and paste the token + account ID into `.env` (your editor,
   not chat).
4. Tell me "cloudflare token's in .env" and I take it from there.

## What I do once the token exists
- `infra/deploy-site.sh` → deploys `site/` (the teaser) to Cloudflare Pages.
- Wire `littlejo.hn` → the Pages project (custom domain).
- Enable DNSSEC + set an IPFS/ENS fallback later (opsec checklist).

## DNS decision
Recommended: point `littlejo.hn` nameservers (at Njalla) to Cloudflare, so DNS sits
behind CF's security + DDoS and I can manage records. Tradeoff: CF then holds DNS, so
that CF account MUST be hardware-2FA'd. Net security is better than Njalla's basic DNS
for a DeFi frontend. Alternative: keep DNS at Njalla, CNAME to Pages (simpler, less
control, no CF proxy).
