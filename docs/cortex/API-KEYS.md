# Cortex — API Keys & Credentials Matrix

> **No secret values in this file — ever.** This is the requirements + status map. Actual keys live in gitignored stores (see "Where secrets live" below) or in the harness/backend, never in the client bundle or a committed file.

## Golden rules (secret hygiene)
1. **Never in the extension bundle.** Anything `VITE_`-prefixed is compiled into the public extension. Only truly public values (Supabase URL + anon key) may be `VITE_`-prefixed. Secret API keys must NOT be.
2. **Secrets are server-side or harness-side.** Cortex reaches paid APIs via (a) the user's existing agent harness (Phase 1, cron-in-harness — the harness already holds Anthropic/OpenAI auth), (b) a backend proxy (Supabase edge function / `flux-asana-widget` server) that holds keys, or (c) Vercel AI Gateway. The extension calls the proxy, never the provider directly.
3. **Gitignored stores only.** New local secrets → `.env.cortex.local` (root, gitignored) or `flux-asana-widget/.env` (already gitignored). Supabase edge-fn secrets → `supabase secrets set`. The tracked root `.env` holds ONLY the publishable Supabase URL/anon — do not add secrets to it.

## Where secrets live (stores)
| Store | Path / mechanism | Gitignored? | Use for |
|---|---|---|---|
| Client-public | `.env` (root, `VITE_*`) | ⚠️ TRACKED (publishable only) | Supabase URL + anon key |
| Cortex dev secrets | `.env.cortex.local` (root) | ✅ (added) | local dev / scripts / backend proxy testing |
| Widget server | `flux-asana-widget/.env` | ✅ | server-side keys for the Express proxy |
| Supabase edge fns | `supabase secrets set KEY=…` | n/a (remote) | production backend-proxy inference |
| Harness | Claude Code / Codex own auth | n/a | Phase 1 cron-in-harness (no app key needed) |

---

## Requirements matrix

Legend — **Have** = already provisioned somewhere in Flux · **Need** = must procure · **Harness** = covered by the user's agent harness in Phase 1.

| # | Capability | Provider (primary) | Cluster / Phase | Status | Location (post-inventory) |
|---|---|---|---|---|---|
| K1 | Speech-to-text (dictation, hotkey transcription, voice notes) | **AssemblyAI** | C9 · Phase 3 | ✅ **Have** (Flux) | ⏳ locating |
| K2 | Realtime two-way voice ("speak to Tabby") | **OpenAI `gpt-realtime`** | C9 · Phase 3 | ✅ **Have** (Flux) | ⏳ locating |
| K3 | Text-to-speech (Tabby's modal-replacement voice) | OpenAI TTS / `gpt-realtime` audio-out | C9 · Phase 3 | ✅ likely via K2 | same as K2 |
| K4 | Cloud DB / ledger cloud-batch backup | **Supabase** | C4 · Phase 1 | ✅ **Have** | root `.env` (URL+anon), service_role ⏳ |
| K5 | LLM reasoning — optimization loop, recommendations | **Anthropic (Claude/Fable)** | C5/C6/C7 · Phase 1 | 🟡 **Harness** covers P1; **Need** for backend-proxy path | ⏳ check Flux |
| K6 | Vision — screenshot frame analysis when text insufficient | Anthropic Claude vision (or OpenAI vision) | C4/C5 · Phase 1–2 | 🟡 via K5 / K2-provider | — |
| K7 | Unified routing / fallbacks / observability | **Vercel AI Gateway** | C8 · Phase 2 | ❓ **Need** if we adopt (optional) | ⏳ check Vercel |
| K8 | External archive — OneDrive | **Microsoft Graph** (OAuth app) | C3 · Phase 2+ | ❌ **Need** (net-new) | — |
| K9 | External archive — Google Drive | Google OAuth | C3 · Phase 2+ | ✅ via connector | — |
| K10 | Premium TTS (optional, if OpenAI TTS insufficient) | ElevenLabs | C9 · Phase 3 | ❌ optional net-new | — |
| K11 | Asana (checkpoints, feedback→task) | Asana PAT / OAuth app | cross-cutting | ✅ **Have** (widget uses `ASANA_CLIENT_SECRET`) | `flux-asana-widget/.env` |

## Net-new to procure (the actual "get" list), priority order
1. **Anthropic API key (K5/K6)** — the one thing that unblocks non-harness AI (backend-proxy inference + programmatic vision). Highest value. *(Phase 1 can proceed on the harness alone, but we want this staged for Phase 2.)*
2. **Vercel AI Gateway key (K7)** — only if we commit to Gateway routing; gives multi-provider fallback with one key. Decide before Phase 2.
3. **Microsoft Graph app (K8)** — OneDrive archival; deferrable to Phase 2+.
4. **ElevenLabs (K10)** — only if OpenAI TTS quality is insufficient for Tabby's voice; evaluate in Phase 3.

## Phase 1 reality check
Phase 1 (local-first + cron-in-harness) needs **no net-new paid key**: Supabase (have) + the user's harness auth (Claude Code/Codex) cover it. The procurement above is to **unblock Phase 2/3 ahead of time** so dev never stalls waiting on credentials.

## Inventory results — 2026-07-09 (ecosystem sweep)
Canonical source of the reusable keys: `C:\Users\mrmal\le dev\Flux\.claude\worktrees\infallible-margulis-7393e0\.env` (gitignored) + Tabatha root `.env`.

| Key | Reality | Action taken |
|---|---|---|
| OpenAI (`sk-proj-…`) | ✅ real, populated — covers realtime voice, TTS, **Whisper STT**, vision, LLM | wired → `.env.cortex.local` |
| AssemblyAI | ⚠️ **var exists but BLANK** — never actually procured | slot wired empty; **procure or drop in favor of Whisper** |
| Anthropic / Fable | ❌ nowhere in the ecosystem | net-new slot in `.env.cortex.local` |
| Vercel AI Gateway | ❌ not found | net-new slot |
| ElevenLabs / Deepgram / PlayHT | ❌ not found | net-new slot (optional) |
| Microsoft Graph / OneDrive | ❌ not found | net-new slot (optional) |
| Supabase (Flux proj `mtdgoahskcibjbhfvofx`, shared w/ Tabatha) | ✅ URL + anon + mgmt access token | wired → `.env.cortex.local` |
| Google OAuth (id+secret) | ✅ | wired → `.env.cortex.local` |
| Asana PAT (Malkio) | ✅ | wired → `.env.cortex.local` |

**Consequence:** OpenAI alone covers STT (Whisper), TTS, realtime voice, vision, and LLM — so **Phases 1–3 are unblocked today**. The only net-new keys with real pull are **Anthropic** (only if we specifically want Fable/Claude quality for the optimization loop + vision) and, optionally, **AssemblyAI** (only if preferred over Whisper). Everything else is deferrable.

**Local dev store created:** `.env.cortex.local` (root, gitignored) — populated with the reusable keys + blank slots for net-new. Server/harness-side only.

### Security flags surfaced by the sweep (separate cleanup, not blocking)
- `Tabatha\.env` is **tracked in git** (holds only the publishable Supabase anon/URL — low risk, but should be untracked + `.env.example` added).
- Plaintext secrets in **non-git folders**: `Mojo\.env.asana` (7 agent PATs), `Pondo\.env`, `Recon work\rinsed-recon\.env`, `TGC\social-agent\secrets.txt` (GHL key duplicated into a `.txt`).
- Flux OpenAI/Google secrets are duplicated into a `.next/standalone/.env` build artifact — leaks if that folder is ever shipped.
→ Logged for a hygiene pass (see parking lot / a follow-up task).

## Procurement notes
- Keys the user OWNS (existing consoles): can be minted from the provider dashboard under the user's login. AssemblyAI/OpenAI already exist in Flux — **reuse, don't re-mint**.
- Net-new accounts (billing decision) require the user: never sign up / enter payment autonomously.
- After procurement: store per "Where secrets live", update the Location column here, and (for prod) `supabase secrets set`.
