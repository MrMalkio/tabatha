# Feature #214 — Priority Matrix & Lazy Priority (Two-Tier Priority System)

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** Focus Engine (#122), #213 Focus/Task Data Architecture
> **Created:** 2026-05-30
> **Source:** User, 2026-05-30
> **Category:** Priority / Architecture
> **Pairs With:** #213 Focus/Task Data Architecture, #210 Priority Challenge

## User Context (Quotes)

> "Our current priority system is ranking P1 to P5, with P1 being the highest and P5 the lowest. I want to refer to that as **lazy priority** — something a user can do quickly."
>
> "In our own priority system we have something called the **priority matrix** (it's mentioned inside our Asana skill). It's a more detailed, contextual priority ranking because it takes into account: urgent, non-urgent, relevant / high relevance, low relevance. That way, when the AI or any of our scripts consider what is really important, it has better context instead of just a measly rating of 1–5."
>
> "Inside our priority matrix, the 1–5 is nested inside the quadrant it's in. So there are urgent tasks and non-urgent tasks. The 1–5 is the last ranking, after first figuring out if it's urgent or not, along with high relevance vs. low relevance. That way, when we're addressing urgent tasks, we address those in order of their own rankings based on urgency. Urgency is not necessarily tied to a due date."
> — User, 2026-05-30

> ⚠️ **Reconcile required:** The canonical Priority Matrix definition lives in the **Asana skill** (not present in this repo). Before implementing, pull the exact axis/quadrant terminology and ranking rules from there and align this spec to it. The model below is reconstructed from the user's description and may differ in naming.

---

## What It Does

Establishes a **two-tier priority system** on focuses (and, lightly, tasks per #213):

1. **Lazy Priority** — the quick P1–P5 rating (P1 highest, P5 lowest). Fast, low-friction, what users reach for by default.
2. **Priority Matrix** — a richer, contextual ranking that the AI and automation scripts use to reason about what *actually* matters. It classifies along two axes first, then ranks within the resulting quadrant.

The matrix is the **source of truth when present**; lazy priority is the fallback / fast path. Both should map onto a single comparable ordering so #210 (Priority Challenge) and schedulers (#208) can ask "what's the top item?" deterministically.

---

## The Priority Matrix Model

Two classification axes (resolved **before** any 1–5 number):

- **Urgency:** Urgent ↔ Non-urgent. *Urgency is NOT tied to a due date* — it's about time-sensitivity of attention.
- **Relevance:** High relevance ↔ Low relevance.

This yields four quadrants:

| | High Relevance | Low Relevance |
|---|---|---|
| **Urgent** | Q1 — Urgent + High relevance | Q2 — Urgent + Low relevance |
| **Non-urgent** | Q3 — Non-urgent + High relevance | Q4 — Non-urgent + Low relevance |

Within each quadrant, items carry their **own nested 1–5 ranking** (the *last* ranking step). So sorting is:

```
1. Quadrant (Urgent/High first … down to Non-urgent/Low)
2. Then the nested 1–5 within that quadrant
3. Then tie-break: oldest → newest (age)
```

> Quadrant ordering precedence (Q1 > Q2 > Q3 > Q4) should be **confirmed against the Asana skill's canonical ordering** — relevance-vs-urgency precedence is a deliberate choice and the Asana definition governs.

---

## Relationship Between The Two Tiers
- **Lazy → Matrix:** a quick P1–P5 can map to a default quadrant + nested rank (e.g., P1 → Urgent/High rank 1) until the user refines it. The mapping is a starting point, not a lock.
- **Matrix → Comparable score:** the matrix collapses to a single sortable key `(quadrantRank, nestedRank, age)` so all consumers (challenge engine, schedulers, sidebar sort) share one ordering.
- **Display:** show lazy priority as the at-a-glance badge; reveal the matrix on expand/edit.

---

## Data Model

```json
{
  "focus": {
    "id": "f_ship_release",
    "label": "Ship v0.3 release",
    "lazyPriority": "P1",
    "priorityMatrix": {
      "urgency": "urgent",          // "urgent" | "non_urgent"
      "relevance": "high",          // "high" | "low"
      "quadrant": "Q1",             // derived
      "nestedRank": 1,              // 1–5 within quadrant
      "setBy": "user"               // "user" | "system" | "ai"
    },
    "createdAt": "2026-05-30T09:00:00Z"
  }
}
```

Tasks (#213) carry **lazy priority** + inherit matrix context from their parent focus by default; full matrix on a task is optional.

---

## UI / UX
- **Lazy entry:** existing P1–P5 picker (keep it, it's the fast path).
- **Matrix entry:** a compact 2×2 selector (urgent/non-urgent × high/low) + a 1–5 within-quadrant rank. Available on focus create/edit, sidebar, and via voice (#211).
- **Sorting everywhere** (sidebar, planner, queue) uses the unified comparable key.
- **Badges:** lazy P-badge always; small quadrant glyph when matrix is set.

---

## Why This Matters (Downstream)
- **#210 Priority Challenge:** "is this more important than…" iterates higher-priority items via the unified ordering, highest quadrant/rank first, oldest→newest.
- **#208 Smart Deferral:** scheduler weighs quadrant + rank, not just P1–P5.
- **AI Counterpart / #211 Voice:** richer context → better automated decisions about what to surface, challenge, or schedule.

---

## Open Questions
1. **Canonical terms & ordering** — pull from the Asana skill and align (axis names, quadrant precedence, whether "relevance" or "importance" is the term).
2. Default **lazy → quadrant** mapping table.
3. Is urgency ever **auto-derived** (e.g., from blockers, dependencies, or deadlines) or always user/AI-set? (User notes urgency ≠ due date, so auto-derivation must be careful.)
4. Migration of existing P1–P5 data into the new structure (keep lazyPriority as-is; matrix initially empty / inferred).

---

## Related Features
- #213 Focus/Task Data Architecture (priority lives on the focus/parent task)
- #210 Priority Challenge & Accountability (consumes the ordering)
- #208 Smart Deferral · #035 Time-Blocking Calendar
- Asana skill (canonical Priority Matrix definition — reconcile)
