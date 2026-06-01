# Implementation Plan 038: URL Rules Intelligence & Training Mode

> **Current version:** 6.0.0
> **Target version:** 6.3.0
> **Source:** QA regression session 2026-05-29 — A4 scope-out, user and Mike transcript features.
> **Absorbs:** Parking lot items — domain tracking, training mode, advanced field-picker training.

---

## Goal

Transform URL Rules from a static list users manually maintain into an intelligent, self-improving system. Tabatha persistently learns every domain the user visits, lets them teach it what those domains mean, and eventually can suggest — and in advanced mode auto-generate — intents, focuses, tasks, and checkpoints from live page content.

---

## Background

Currently:
- Domain groups are computed only from open tabs (ephemeral — gone when tabs close)
- URL rules are manually created and static
- There is no mechanism for Tabatha to learn from browsing patterns

Mike transcript reference: A tool/extension for QuickBooks that reads page data to surface contextual actions. The "advanced training" concept is the same idea — Tabatha learns the structure of a page and can extract merge-tag data for automatic context creation. See `docs/features/mike-transcript-features.md` for the full QuickBooks reference.

---

## Phases

---

### Phase 1 — Persistent Domain Store

**Problem:** Domain groups vanish when tabs close. Users can't create URL rules for sites they visited yesterday.

**Solution:** Every URL Tabatha tracks gets written to a persistent `domainHistory` store in `chrome.storage.local`, capped at a configurable number (default 2000 entries).

**Schema:**
```js
domainHistory: {
  "github.com": {
    domain: "github.com",
    firstSeen: "2026-05-01T10:00:00Z",
    lastSeen: "2026-05-29T21:00:00Z",
    visitCount: 142,
    paths: Set<string>,        // stored as array, capped at 50 paths per domain
    observedIntents: string[], // intents users have set on this domain
    status: "active" | "dismissed" | "targeted", // default "active"
    rulesCount: number         // derived: how many URL rules match this domain
  }
}
```

**Files:**
| File | Change |
|------|--------|
| `tabService.js` | On every `handleTabCreated` / `handleTabUpdated`, write domain + path to `domainHistory` |
| `settingsService.js` or new `domainHistoryService.js` | Expose `GET_DOMAIN_HISTORY`, `DISMISS_DOMAIN`, `TARGET_DOMAIN`, `CLEAR_DOMAIN_HISTORY` |
| `settings/UrlRulesSection.jsx` DomainsTab | Read from persistent store instead of open tabs. Show `visitCount`, `lastSeen`. Add Dismiss / Target buttons per domain. |
| `constants.js` | Add `domainHistoryMaxDomains: 2000` setting |

**Dismiss:** Marks a domain as `dismissed` — it won't appear in the domain list and Tabatha won't prompt about it.  
**Target:** Marks a domain as `targeted` — Tabatha will proactively prompt the user to create a rule the next time they visit.

---

### Phase 2 — Rule Suggestions & Prompt Frequency

**Problem:** Tabatha has no way to proactively help users build their rule library.

**Features:**

1. **Targeted domain prompting:** When the user navigates to a `targeted` domain without an existing matching URL rule, InBar shows a gentle chip: "💡 Create a rule for `github.com`?"

2. **Configurable prompt frequency per domain:**  
   Settings UI: a global "Rule suggestion frequency" slider with options:  
   - `never` — never prompt  
   - `once` — prompt once per domain, then stop  
   - `periodic` — re-prompt after N visits (default: every 50 visits)  
   Stored in `domainHistory[domain].promptFrequency` (overrides global).

3. **Auto-create rule from intent:** When the user sets an intent on a tab, offer "Save as rule for this domain?" — one click creates the URL rule.

**Files:**
| File | Change |
|------|--------|
| `autoFocusService.js` | Add domain-targeting prompt logic (re-uses existing suggestion chip mechanism) |
| `tabService.js` | Fire "create rule?" suggestion on intent assignment |
| `settings/UrlRulesSection.jsx` | Frequency control per domain |
| `constants.js` | `ruleSuggestionFrequency: 'once'` |

---

### Phase 3 — Training Mode

**Problem:** When a user encounters a new web app (accounting software, project tool, internal tool), there's no structured way to teach Tabatha what it means.

**Training Mode flow:**

1. User clicks "🎓 Enter Training Mode" from the InBar or from Settings → URL Rules.
2. Tabatha overlays a slim training bar at the top of the page (above the InBar) showing: "Training: `app.acme.com` — Answer a few questions to help Tabatha understand this app."
3. As the user navigates within the domain during training, Tabatha collects unique paths.
4. For each distinct path pattern detected, it asks:
   - "What are you doing on this page?" → sets the `defaultIntent` for a URL rule
   - "What context does this page belong to?" → sets `defaultContext`
   - "Should Tabatha auto-create a focus when you open this?" → sets `autoCreateFocus`
5. When done, Tabatha shows a summary: "Created 4 rules for `app.acme.com`."
6. **Upload to community:** User can optionally export their training as a JSON package. These get submitted to a developer-facing endpoint (future: Tabatha app store of community rule packs).

**Files:**
| File | Change |
|------|--------|
| `src/content/inbar.js` | Add training bar HTML/CSS (separate from InBar — injected above it). State machine: idle → active → summary. |
| new `trainingService.js` | Manage training session state: which domain, collected paths, pending Q&A, generated rules. |
| `tabService.js` | While training is active, broadcast `TRAINING_URL_OBSERVED` on every navigation within the trained domain |
| `background.js` | Register trainingService |
| `settings/UrlRulesSection.jsx` | "Start Training" button per domain in the Domains tab |
| Message types | `START_TRAINING { domain }`, `TRAINING_ANSWER { path, intent, context, autoCreate }`, `END_TRAINING`, `EXPORT_TRAINING_PACK` |

---

### Phase 4 — Advanced Training (Visual Field Picker)

**Context:** Mike referenced a QuickBooks tool/extension that can read page data to surface contextual actions. The concept: users click on fields/elements in a page and those become "merge sources" — Tabatha can extract their values automatically to populate intents, focuses, tasks, and checkpoints.

**How it works:**
1. User activates "Advanced Training" for a specific URL pattern.
2. Tabatha injects a click-capture overlay over the page.
3. User clicks a field (e.g., a customer name, invoice number, job name in QuickBooks).
4. Tabatha records: the CSS selector path, the element's text content, and labels it (e.g., "Customer Name", "Invoice #").
5. These become **merge tags**: `{{Customer Name}}`, `{{Invoice #}}`.
6. User can then build intent/focus/task templates using merge tags: "Working on invoice {{Invoice #}} for {{Customer Name}}".
7. When Tabatha detects this URL pattern in the future, it extracts the live values and auto-fills the intent/focus/task from the template.

**Technical approach:**
- Click capture overlay: injected as a content script (separate from InBar to avoid z-index conflicts), uses Shadow DOM.
- CSS selector generation: a robust selector generator (similar to what browser devtools use) captures the stable selector for each element.
- Value extraction: a `content_script` that runs on the target URL pattern, extracts values at page load, and posts them to the background.
- Template rendering: `{{tag}}` substitution at intent/focus creation time.
- Privacy: extraction happens locally. No data leaves the device unless the user explicitly uploads a training pack.

**Privacy note:** Advanced training requires `<all_urls>` permission OR per-domain host permissions. This must be clearly disclosed to users during advanced training setup.

**Files:**
| File | Change |
|------|--------|
| new `src/content/fieldPicker.js` | Click-capture overlay content script. Shadow DOM, click listener, selector generation, communicates back via `chrome.runtime.sendMessage`. |
| new `trainingService.js` (Phase 3) | Extended to store field definitions and render merge-tag templates |
| `manifest.json` | Add `fieldPicker.js` as a conditionally-injected content script |
| `tabService.js` | On URL match with active field templates, trigger extraction content script |

---

## Phasing & effort

| Phase | Effort | Unlocks |
|-------|--------|---------|
| 1 — Persistent domain store | 2–3 days | Domains tab shows history always; Dismiss/Target |
| 2 — Rule suggestions + frequency | 2 days | Proactive rule-building workflow |
| 3 — Training mode | 3–4 days | Structured per-domain teaching |
| 4 — Visual field picker | 5–7 days | Full contextual automation (QuickBooks-style) |

**Total:** ~2–3 weeks across 4 phases. Phases 1–2 can ship independently as a meaningful upgrade to the URL Rules section.

---

## Parallelability review

- **Zones touched:** Tab tracking (tabService), Storage (new domainHistory key), URL Rules UI, InBar content script (training bar), new trainingService
- **Shared files modified:** `tabService.js` (additive — new write per navigation), `background.js` (new service registration), `manifest.json` (Phase 4 only)
- **Conflicts:** None with Plan 037 (time editing is focusService + timeline UI only). Plan 035 (calendar) touches different zones.
- **Can run parallel with:** Plan 037 fully. Plan 035 Phase 2 (calendar UI) fully.
- **Recommended split:** Branch A = Phases 1–2 (domain store + suggestions), Branch B = Phases 3–4 (training), B forks after A merges.
- **Max branch lifetime:** Phase 1–2 branch: 5 days. Phase 3–4 branch: 10 days.
