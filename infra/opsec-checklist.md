# LittleJohn opsec checklist (pre-launch, DNS/frontend focus)

The MM Finance $2M loss (May 2022) was a DNS/frontend hijack, not a contract bug —
attackers changed what the domain pointed at and injected a malicious contract
address. This checklist closes that class of attack. Tick before littlejo.hn is public.

## Tier 1 — account-takeover defense (stops the MMF-class attack)
- [ ] Hardware-key 2FA (YubiKey-class, NOT SMS/app-code) on **Njalla** (registrar)
- [ ] Hardware-key 2FA on **Cloudflare** (DNS + hosting)
- [ ] Hardware-key 2FA on the **project email** (the recovery backdoor for the above)
- [ ] Registrar lock enabled at Njalla; no registrar API token exists
- [ ] DNSSEC enabled at registrar + Cloudflare
- [ ] Unique passwords in a password manager; zero reuse with personal accounts

## Tier 2 — frontend integrity
- [ ] CSP (Content-Security-Policy) header restricting script sources + connect targets
- [ ] Subresource Integrity (SRI) hashes on any external script/style
- [ ] No third-party scripts in the dapp (self-host everything)
- [ ] Scoped Cloudflare API token (Pages/DNS edit only), rotatable; no global key
- [ ] HSTS + preload

## Tier 3 — structural (turns a hijack from fatal into survivable)
- [ ] IPFS/ENS canonical frontend (verifiable fallback if clearnet is compromised)
- [ ] Official contract addresses published out-of-band: verified on Blockscout,
      in the repo, pinned on X — so a swapped address is detectable
- [ ] DNS-change alert (any record change → notification)
- [ ] Frontend integrity monitor (checksum live site; alert on unexpected hash change)

## Single highest-leverage item
Hardware keys on registrar + DNS + recovery email. That closes the exact door MMF's
attackers walked through. Everything else is defense-in-depth on top.
