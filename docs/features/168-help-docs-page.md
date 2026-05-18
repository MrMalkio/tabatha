# Feature #168 — Help & Docs Page (Website)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** Website (not core app)  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Help and docs page with a help page that details how every feature works, with adjacent feature relevance and links to everything. (This goes in the website not the core app.)"
> — User, 2026-05-14

## What It Does

A **public-facing documentation site** (on the Tabatha website, not inside the extension) that explains every feature, shows how they connect, and provides a searchable knowledge base. Each feature page links to related features, creating a navigable web of documentation.

## Structure

- Feature catalog (all features with search/filter)
- Per-feature pages: what it does, how to use it, related features, screenshots
- Getting started guide
- FAQ / troubleshooting
- Keyboard shortcuts reference
- API/webhook documentation (for #164, #175)

## Implementation Notes

- Static site generator (Astro, Next.js, or Docusaurus)
- Auto-generated from `docs/features/` concept files where possible
- Adjacent feature links: each page shows "Related Features" based on `Depends On` graph
- In-extension link: Settings → "Help & Docs" opens website in new tab
- Versioned: docs tied to extension version

## Open Questions

- Should docs be auto-generated from concept files or hand-written?
- Video tutorials alongside text documentation?
- Community-contributed docs (wiki model)?
