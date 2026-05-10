# 🔧 Decomp Track Ready — May 10, 2026

**From:** Antigravity  
**For:** Whoever picks up the `refactor/service-arch` branch  

A full service decomposition plan is staged on branch `refactor/service-arch`.

## What to do:
1. `git checkout refactor/service-arch`
2. Read `docs/architecture/service-decomp-plan.md` — it's self-contained
3. Follow the extraction order (E1→E16)
4. Update `docs/architecture/migration-checklist.md` as you go

## What NOT to do:
- Don't touch `master`
- Don't add new features — this is a behavior-identical refactor
- Don't change any message response shapes

## Key files:
- `docs/architecture/service-decomp-plan.md` — strategy + extraction order
- `docs/architecture/service-map.md` — 62 handlers → 11 services
- `docs/architecture/migration-checklist.md` — parity tracking (update this!)
