---
name: showcase-site-update
description: >-
  Update an EXISTING component-showcase / marketing site that was already built
  by the /component-showcase-site skill — do NOT rebuild it. Use for any request
  to change the live showcase: "Update the */show with ...", add or reflag a
  component tile, promote a feature to Shipped, edit the feature list, add a
  roadmap card, change the masthead/nav, or refresh copy. Runs a completeness
  CHECKLIST so a single change lands in every place it must (tiles, component
  pages, roadmap.json, regenerated search index, version bump) and is deployed
  + verified live without breaking other routes. Trigger on: "update the show
  page", "add to the showcase", "mark X shipped on the site", "update the
  roadmap", "feature list", "showcase site", "/show".
---

# Showcase Site Update

Surgically update an already-built showcase/marketing site. **Never regenerate
the site from scratch** — that's `/component-showcase-site`. Your job is to make
a specific, correct edit land everywhere it belongs, ship it, and prove it.

## When to use
- "Update the `*/show` with …"
- Promote a component/feature (In development → Shipped), add a new tile
- Add/adjust a roadmap card, feature list entry, masthead button, or copy
- Any small content change to the live showcase

## The golden rule
A showcase site holds the **same fact in several derived places**. Changing one
and missing the others is the failure mode. Walk the checklist every time.

## Checklist (do in order; tick each)

### 1. Locate the real source — confirm, don't assume
- [ ] Find the site directory (often `site/`), and the **branch that is actually
      live**. Repos with worktrees can have several stale copies.
- [ ] **Confirm** by matching the live homepage to the source: fetch the live
      page and diff against `site/index.html` (or the project's homepage file).
      If they don't match, you have the wrong source — find the right one.
- [ ] Identify the deploy target (Cloudflare Pages project name, or Vercel/etc).
- [ ] If you cannot confidently identify the source, **STOP and report** — do
      not guess and deploy.

### 2. Map the change to every file it touches
Ask: "where does this fact appear?" Typical surfaces:
- [ ] **Masthead / nav** — buttons, links (e.g. a "Sign in" / product link).
- [ ] **`/show` index** — the component/feature **tiles** and their **status
      flags** (In development / Shipped / Beta). Update label, flag, and link.
- [ ] **Component detail pages** (e.g. `components-*.html`) — the longer write-up.
- [ ] **`roadmap.json`** (or equivalent) — add/move cards across
      Todo / In-progress / Resolved. Keep version + date fields consistent.
- [ ] **Search index** (`search-index.json`) — **never hand-edit; regenerate**
      via the project's build script so the new content is searchable.
- [ ] **Legal/derived pages** (privacy, sitemap) if a build script regenerates them.
- [ ] **Version + changelog** — bump the project's source-of-truth version and
      add a changelog line if the project versions site changes.

### 3. Edit to match, not to restyle
- [ ] Reuse the site's existing **design tokens, components, and voice**. A promo
      tile should look like the other tiles, not a new invention.
- [ ] Copy is active, specific, user-facing.

### 4. Regenerate derived files
- [ ] Run the project's build scripts (e.g. `npm run site:build`, `version:sync`)
      so search index, privacy, version stamps, etc. are regenerated — don't
      hand-maintain generated files.

### 5. Deploy to production
- [ ] Deploy with the platform CLI. **Cloudflare Pages gotcha:** a bare
      `wrangler pages deploy <dir> --project-name=<p>` auto-detects the git
      branch and publishes to a **preview alias**, not production. Pass the
      Pages **production branch explicitly**: `--branch=<prod-branch>` (this is
      a Pages deploy flag, NOT a git push to that branch).

### 6. Verify LIVE — evidence, not assumption
- [ ] Fetch the live URLs with **node `fetch`** (on Windows, `curl` can fail with
      a TLS-revocation quirk — prefer node). Confirm:
  - [ ] Homepage → 200 and the change is present (e.g. the new button/text).
  - [ ] The specific updated page (`/show`, roadmap json) shows the update.
  - [ ] **Other routes still work** — you didn't shadow or break anything
        (e.g. a co-hosted app path).

### 7. Git hygiene
- [ ] Work on a branch; Conventional Commits; **no `Co-Authored-By` footer**.
- [ ] Do not push to `main`. Pushing the branch / opening a PR to `staging` is
      fine. Note that the wrangler deploy is a direct upload independent of git —
      **push the branch anyway** so the committed work isn't lost locally.

## Handling "Update the */show with …"
1. Parse the requested fact/change.
2. Run **step 2** to list every surface it touches — state the list back.
3. Apply edits (step 3), regenerate (step 4), deploy (step 5), verify (step 6).
4. Report: files changed, deploy id, and the live-verification output.

## This project (Tabatha) specifics
- Site dir: `site/`. Deploy target: **Cloudflare Pages project `tabatha`** →
  `https://tabatha.pondocean.co`. Production branch flag: `--branch=main`.
- Surfaces: `site/index.html` (masthead), `site/show/index.html` (tiles),
  `site/show/components-*.html` (detail), `site/show/roadmap.json` (cards),
  `site/show/search-index.json` (**regenerated**, don't hand-edit).
- Build/version: `npm run site:build`, version source of truth is the manifest,
  propagated by `npm run version:sync`; add a `Tabatha_Changelog.md` line.
- **Co-hosted app:** `tabatha.pondocean.co/sidecar*` is a separate Cloudflare
  **Worker** (the Tabby Sidecar app). The Pages deploy must not shadow it —
  always re-verify `/sidecar` returns the Sidecar app after deploying.
- Verify with node fetch (curl has a schannel revocation quirk on this host).
