# Plugin: Versioning Policy

## When This Applies
Any project that has releasable versions (apps, packages, libraries).

## Rules
- Follow Semantic Versioning: `MAJOR.MINOR.PATCH`
- PATCH: Bug fixes, small tweaks, no behavior change
- MINOR: New features, non-breaking changes
- MAJOR: Breaking changes, architecture shifts
- Update version in: package.json, headbox Project State, and changelog
- Tag releases in git: `v{MAJOR}.{MINOR}.{PATCH}`
- If the project has an ADR system, log version bumps there

## Agent Behavior
- When you ship a fix → bump PATCH
- When you add a feature → bump MINOR
- When you make breaking changes → bump MAJOR
- Always update Project State after a version change
