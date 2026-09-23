# Pairing work recovered; not approved for deployment

Recovered from bfc912e on `fix/pair-watch-hardening`, with the historical expiry investigation test from 2607705. These files are deliberately outside `supabase/functions/` and `supabase/migrations/` so a routine deployment cannot enable unreviewed behavior.

Review on 2026-09-23 reproduced failures using the actual handler with mocked dependencies: code-consumption failure still returns HTTP 200 with session tokens, and failed attempt-ledger writes allow repeated guesses without rate limiting. SQL leases have no owner nonce, so a delayed claimant can affect a newer lease. Rate checking and recording are not atomic. These defects can recur under database errors or concurrent requests.

The source and original branch remain preserved. Required follow-up: fail-closed consumption/attempt accounting, owned leases, atomic rate limiting, production-channel CORS and integration tests. Live deployed source and migration state could not be inspected because the configured management credential was rejected. No backend deployment was performed by the reconciliation.
