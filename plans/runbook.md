# Yuxi's runbook — the human-only actions

Everything buildable is built. These are the things only you can do (accounts, keys, funds,
legal). Ordered by what unblocks the most. Two tracks run in parallel: **Technical** (get
it on-chain) and **Identity** (go public anon). Do Track A step 1 today — it's 15 minutes and
unblocks the biggest chunk.

Cost summary: testnet = free. eSIM ~$15 (XMR). Domains already paid. Legal consult ~low 4 figures.
Everything else is time.

---

## TRACK A — Technical (get LittleJohn on-chain)

### A1. Fund a testnet key  ·  15 min · free · UNBLOCKS: the entire dapp + Season 0 testnet quests
1. Make a throwaway key (already have Foundry):
   ```bash
   ~/.foundry/bin/cast wallet new
   ```
   It prints an address + private key. This key is **testnet-only, forever** — never mainnet, never real funds.
2. Get testnet ETH: go to https://faucet.testnet.chain.robinhood.com , paste the address, request.
   (Chain id 46630, RPC https://rpc.testnet.chain.robinhood.com if you want it in a wallet.)
3. Put the key in a local file (never in chat):
   ```
   # contracts/.env
   PRIVATE_KEY=0xyourkey
   ```
4. Tell me **"testnet funded"** → I broadcast, fill in all the addresses, run the post-deploy
   sequence, and the dapp + testnet quests light up against real contracts.

### A2. Season 0 portal Cloudflare token  ·  10 min · free · UNBLOCKS: the points campaign
- The portal needs a Cloudflare token with **D1 + Pages** scope (see `.env.example`) and a D1 database.
- Either: create the token + drop it in `.env`, tell me, and I deploy the portal + run the D1 setup.
- Or you run the 4 commands in `season0/README.md` yourself.

### A3. Governance multisig  ·  30 min · free (testnet) · UNBLOCKS: safe mainnet launch
- Pick **3 wallets you control on separate devices** (e.g. hardware wallet + phone + laptop).
- Give me the 3 addresses → I create your 2-of-3 Safe against the on-chain singleton and we
  rehearse the full governance handoff on testnet. Same recipe reused at mainnet.

---

## TRACK B — Identity (go public, anonymously)

Do these in order; each feeds the next. This is the fiddly part — take your time, it's the
foundation for staying anon.

### B1. Project email  ·  10 min · free
- Proton Mail, signed up over a VPN, username unrelated to you, no personal info. Everything
  below uses this email. Turn on 2FA.

### B2. Clean Monero  ·  varies · UNBLOCKS: paying for anon services without a trail
- You need some XMR that did **not** come straight from a KYC exchange to the destination.
  Acquire no-KYC (a no-KYC swap from self-custody crypto; see kycnot.me for current venues).
- This is the step that keeps the Binance mistake from repeating. Everything anon gets paid from here.

### B3. Silent.link eSIM  ·  15 min · ~$15 in XMR · UNBLOCKS: the X account
- silent.link → pick a plan **with inbound SMS** (not data-only) → pay the XMR invoice → scan
  the eSIM QR. Keep a small balance topped up so the number persists (it's your X recovery method).

### B4. Anon X account  ·  20 min · free · UNBLOCKS: the tease + Season 0 going public
- Sign up with the **project email + the eSIM number**, from a **separate browser profile + VPN**
  (X links accounts by device/IP too). Standard or Premium (blue) is fine; **never** verified-org.
- Handle/bio/posts are ready in `plans/launch-copy.md`. Do NOT post yet — see the ramp.

### B5. Hardware-key 2FA on everything  ·  20 min · ~$25/key · the #1 anti-hijack move
- A physical security key (YubiKey-class) on: **Cloudflare, Njalla, the project email, X.**
- This is what stops the MM Finance-style DNS/account hijack. SMS/app 2FA is phishable; a key isn't.

---

## ONE-OFFS (do soon, not blocking)

### C1. Verify DNSSEC finished
- Njalla should show the DS record submitted. Ping me and I'll check `dig DS littlejo.hn`.

### C2. SG legal consult — DTSP applicability  ·  before TGE, while walking away is free
- One consult with a Singapore crypto lawyer: does the MAS DTSP regime apply to you operating
  this from SG, and does an offshore foundation + you-as-pseudonymous-contributor change it?
- Do this **before the token exists.** If the answer is ugly, you want to know while it's still free to stop.

### C3. Decide the audit path
- Ship on the AI review + public diff page now, fund a Cantina/Sherlock contest from LBP proceeds later.
  (Already the plan; just confirm you're comfortable.)

---

## What happens after (so you see the payoff)
- After **A1**: I broadcast to testnet, you can click through the real dapp, and I wire the
  testnet-quest scoring.
- After **B4**: the tease goes public, mindshare clock starts (UP is still sitting unlaunched).
- Then the ~4–6 week ramp: tease → Season 0 → LBP → TGE (full sequence in `plans/launch-checklist.md`).

## The 3 things that matter most, right now
1. **A1 (testnet key)** — 15 min, unblocks all technical validation.
2. **B1→B4 (Proton → XMR → eSIM → X)** — the anon chain that lets you go public.
3. **C2 (legal consult)** — the one thing that could change the whole plan; do it before TGE.
