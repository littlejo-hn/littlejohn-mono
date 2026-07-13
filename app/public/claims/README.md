# Season claim files

Per-season output of `contracts/tools/heists-merkle/generate.js` goes here as
`season-<id>.json`. The Claim page fetches `./claims/season-<id>.json`, finds the
connected wallet's `{ index, amount, proof }`, and submits it to HeistsDistributor.claim.
No file present => the page shows "not published yet". Never commit a season file
until its root has been openSeason'd + frozen on-chain.
