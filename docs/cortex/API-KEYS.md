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
| K10 | Premium TTS (optional, if OpenAI TTS insufficient) | ElevenLabs | C9 · Phase 3 | ✅ **Have** (minted 2026-07-10, scoped TTS+STT only, key "Tabatha Cortex") | `.env.cortex.local` `ELEVENLABS_API_KEY` |
| K11 | Asana (checkpoints, feedback→task) | Asana PAT / OAuth app | cross-cutting | ✅ **Have** (widget uses `ASANA_CLIENT_SECRET`) | `flux-asana-widget/.env` |

## ✅ VERDICT — what development actually needs

- **Now (Phase 1 + Fable's overnight scaffolding): NO net-new keys.** Covered by OpenAI + Supabase + the user's harness (all already provisioned). Do NOT block on procurement; do NOT mint keys.
- **Requires Malkio (procure only when he's available — each needs his billing/account):**

| When needed | Key | Why | Blocker |
|---|---|---|---|
| Phase 2 (backend-proxy tier) | **Anthropic (Fable/Claude)** | run the optimization loop + screenshot vision on Fable/Claude quality instead of OpenAI-only | paid Anthropic **Console** account + payment method (separate from claude.ai sub) |
| Phase 2 (routing tier) | **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`) | one key → multi-provider fallback + observability | free-tier key on Malkio's Vercel account |
| Phase 2+ (C3 external archive) | **Microsoft Graph** (`MS_GRAPH_CLIENT_ID/SECRET`) | OneDrive archival target | Azure app registration under Malkio's MS account |
| Phase 3 (C9 voice, optional) | **ElevenLabs** | premium TTS if OpenAI TTS isn't good enough for Tabby's voice | evaluate first; likely skip |
| Phase 3 (C9, optional) | **AssemblyAI** | transcription IF preferred over OpenAI Whisper (Flux slot is blank) | free tier; only if Whisper falls short |
| Phase 2 backend (if service-role needed) | **Supabase service_role** (Flux proj) | server-side privileged DB writes for the proxy | NOT on disk — pull from Supabase dashboard when needed |

None of the above blocks current work. Blank slots for all are pre-created in `.env.cortex.local`.

## 🔑 Key file references (for later dev / Fable — where the EXISTING keys live)

All reusable keys are consolidated into **`C:\Users\mrmal\le dev\Tabatha\.env.cortex.local`** (gitignored, this machine). Canonical upstream sources:

| Key | Canonical source file (gitignored) |
|---|---|
| `OPENAI_API_KEY` (real `sk-proj-…`) | `C:\Users\mrmal\le dev\Flux\.claude\worktrees\infallible-margulis-7393e0\.env` |
| `ASSEMBLYAI_API_KEY` (**blank** — not yet procured) | same Flux worktree `.env` |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | same Flux worktree `.env` |
| `ASANA_PAT` (Malkio) | Flux `.env` (also Caspera/Mojo/SteadyStars per-agent PATs) |
| `SUPABASE_ACCESS_TOKEN` (mgmt, `sbp_…`) | Flux `.env` |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` (Flux proj `mtdgoahskcibjbhfvofx`, shared w/ Tabatha) | `C:\Users\mrmal\le dev\Tabatha\.env` (as `VITE_*`) |

**For later dev:** read `.env.cortex.local` — do not re-hunt the ecosystem, and do not copy these into any tracked or `VITE_`-prefixed file.

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
