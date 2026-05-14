# Privacy Modes — Future Discussion

> **Status:** Deferred  
> **Author:** Malkio  
> **Created:** 2026-05-14  
> **Context:** Plan 023 feedback — user direction on privacy/data collection

---

## Direction

Privacy modes (Full / Balanced / Minimal) are **deferred** until the application experience differences are clearly mapped. There isn't enough UX surface yet to make the modes feel distinct rather than arbitrary.

## Defaults

- **Default mode:** Full (all data collection active)
- **Settings copy:** Should explain what title + URL data is used for (attention tracking, category detection, flow recall)
- **No data leaves the device** unless Supabase sync is explicitly enabled

## When to Revisit

Revisit privacy modes when:
1. Supabase sync is production-ready (not just dev)
2. Desktop companion activity logging is mature
3. There's a real user-facing difference between "full" and "balanced" (e.g., URL tracking vs. domain-only)

## Open Questions

- Should "Minimal" mode disable flow recall entirely, or just stop storing URLs?
- Does the desktop companion have its own privacy toggle, or does it inherit from the extension?
- How does privacy mode interact with data retention settings (already implemented as configurable 90-day default)?
