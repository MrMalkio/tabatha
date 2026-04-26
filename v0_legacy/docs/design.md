# Tabatha — Design Philosophy & System

> This document defines Tabatha's visual language.  
> All UI implementations (extension + site) must follow this guide.  
> When a design decision is ambiguous, reference this document.

---

## Design DNA

Tabatha is a **productivity tool** — not a social app, not a game. Every pixel must communicate:

1. **Clarity** — the user should never wonder "what does this do?"
2. **Calm** — dark, muted tones reduce cognitive load and screen fatigue
3. **Intentionality** — the UI should feel deliberate, not decorative
4. **Density with Breathing Room** — show a lot of data without feeling cramped

### Inspiration Sources
- **Linear** — precision, keyboard-first, dark minimalism
- **Arc Browser** — bold but clean, context-aware chrome
- **Raycast** — compact power, zero wasted space
- **Material Design 3 Expressive** — spring-based motion, adaptive color, shape personality

---

## Color System

### Core Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#0a0a0f` | Page background |
| `--bg-alt` | `#0e0e14` | Alternate section background |
| `--surface` | `#111118` | Cards, panels, inputs |
| `--surface-hover` | `#181822` | Hover states |
| `--surface-active` | `#1f1f2c` | Active/pressed states |
| `--border` | `#1e1e2d` | Borders, dividers |
| `--border-hover` | `#2a2a3d` | Borders on hover |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--text` | `#e0e0ea` | Primary text (headings, tab titles) |
| `--text-secondary` | `#8888a0` | Secondary text (labels, metadata) |
| `--text-muted` | `#444460` | Tertiary text (hints, timestamps) |

### Accent

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#00c896` | Primary action, active states, links |
| `--accent-hover` | `#00e6aa` | Hover on accent elements |
| `--accent-dim` | `rgba(0,200,150,0.12)` | Accent backgrounds |
| `--accent-glow` | `rgba(0,212,170,0.15)` | Badges, highlights |

### Semantic

| Token | Hex | Usage |
|-------|-----|-------|
| `--danger` | `#ff4455` | Destructive actions, critical priority |
| `--danger-dim` | `rgba(255,68,85,0.12)` | Danger backgrounds |
| `--warning` | `#ffaa33` | Medium priority, caution |
| `--info` | `#44aaff` | Low priority, informational |
| `--success` | `#00c896` | Same as accent (intentional) |

### Priority Colors

| Level | Color | Hex |
|-------|-------|-----|
| Critical | Red | `#ff4455` |
| High | Orange | `#ff8844` |
| Medium | Amber | `#ffaa33` |
| Low | Blue | `#44aaff` |
| None | Transparent | `transparent` |

---

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
```

For marketing site only:
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

### Type Scale

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| `heading-xl` | 36px | 700 | 1.1 | Page titles (marketing) |
| `heading-lg` | 24px | 600 | 1.2 | Section headers |
| `heading-md` | 17px | 600 | 1.3 | Card titles |
| `body` | 13px | 400 | 1.4 | Default text |
| `body-sm` | 12px | 400 | 1.4 | Toolbar labels |
| `caption` | 11px | 400 | 1.3 | Metadata, timestamps, chips |
| `micro` | 10px | 500 | 1.2 | Time chips, badges |

### Rules
- **No font sizes below 10px** — accessibility floor
- **No font weights above 700** — keep it clean
- **Letter-spacing** — only use negative tracking on headings (`-0.5px` max)
- **Text truncation** — always use `text-overflow: ellipsis` on single-line labels

---

## Spacing

Based on a 4px grid:

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Inline gaps, icon padding |
| `--space-sm` | 8px | Tight grouping |
| `--space-md` | 12px | Default padding |
| `--space-lg` | 16px | Card padding, section gaps |
| `--space-xl` | 24px | Major sections |
| `--space-2xl` | 32px | Page padding (marketing) |

---

## Shape & Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-xs` | 2px | Icons, tiny elements |
| `--radius-sm` | 4px | Buttons, inputs, chips |
| `--radius-md` | 6px | Cards, panels |
| `--radius-lg` | 8px | Modals, large cards |
| `--radius-pill` | 100px | Pills, badges, tags |

---

## Motion

Inspired by M3 Expressive spring-based physics:

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 100ms | `ease-out` | Button hover, opacity changes |
| Fast | 150ms | `ease-out` | Tooltips, checkboxes, small reveals |
| Normal | 200ms | `ease` | Panel transitions, card hover lifts |
| Slow | 300ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Modal open/close, shake animation |
| Spring | 400ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful bounces (toast entry, badge pop) |

### Rules
- **Never animate layout shifts** (no animating `width`/`height` — use `transform`)
- **Hover effects are immediate** — `opacity` and `color` should feel instant
- **Entry animations only** — elements appear with motion, disappear without
- **Reduced motion** — always respect `prefers-reduced-motion: reduce`

---

## Elevation

Flat design with subtle depth via borders, not shadows:

| Level | Style | Usage |
|-------|-------|-------|
| 0 | None | Body background |
| 1 | `border: 1px solid var(--border)` | Cards, panels |
| 2 | `border + background: var(--surface)` | Floating panels |
| 3 | `box-shadow: 0 4px 24px rgba(0,0,0,0.4)` | Modals, dropdowns only |

### Rules
- **Avoid box-shadow** for anything below level 3
- **Depth = border + background contrast**, not shadow
- **No glows** except on accent badges (subtle `box-shadow` with accent color)

---

## Icon System

- **Primary**: Unicode emoji for categories (🔒🍅📝 etc.)
- **Secondary**: Simple Unicode arrows and symbols (→ ↗ ✕ ☰ ✎)
- **Do not** use icon libraries (no FontAwesome, no Material Icons) to keep extension lightweight
- Future: SVG icon set when branding matures

---

## Component Patterns

### Tab Item (List View)
```
[☐] [●] [Title___________________________] [3m ⚡] [12m] [↗🔒✎✕]
         [📄 Category · Context · 🔒🔗]
```
- Checkbox, priority dot, title, time chips (active/open), actions
- Actions hidden until hover
- Priority dot is 4px wide, full height
- Active time chip uses accent color

### Toolbar
- Single horizontal row, flex-wrap: nowrap
- Inputs left-aligned, actions right-aligned
- No labels — icons + tooltips only
- Separator: `toolbar-spacer` (flex: 1)

### Navigation Tab
- Inline text, no icons
- Active: accent color + 2px bottom border
- Inactive: muted color
- No background changes

### Toast
- Bottom-right corner
- Accent border, dark surface background
- Auto-dismiss after 3s
- Slide-up entry animation

### Card (Feature/Time/Group)
- `var(--surface)` background
- `var(--border)` border
- `var(--radius-md)` corners
- Hover: `translateY(-2px)` + lighter border

---

## Layout Principles

### Extension Pages (sidebar, home, popup)
- **Maximum density** — every pixel counts in a 400px-wide panel
- **No decorative whitespace** — breathing room comes from consistent 8px gaps
- **Single-column layouts** — no multi-column in extension views
- **Full-height flex** — content area always fills remaining viewport

### Marketing Site
- **Max-width: 1100px** centered container
- **Generous whitespace** — 80px section padding
- **3-column grid** for feature cards (responsive to 1-column)
- **Hero: center-aligned**, features: left-aligned

---

## Accessibility

- Minimum contrast ratio: 4.5:1 for body text, 3:1 for large text
- All interactive elements must be keyboard-focusable
- Focus indicators: `outline: 2px solid var(--accent); outline-offset: 2px`
- No color-only information (always pair with text/icon)
- `prefers-reduced-motion` disables all animations
- `prefers-color-scheme: light` — planned for v0.4.0 (dark is default)

---

## Anti-Patterns (What NOT To Do)

❌ Gradients on buttons (marketing hero only)  
❌ Rounded corners > 8px on extension UI  
❌ Multiple accent colors on same screen  
❌ Background images or patterns  
❌ Inline styles in HTML (use classes)  
❌ Emoji as primary navigation (emoji as data labels is OK)  
❌ Font sizes smaller than 10px  
❌ Shadows for anything except modals  
❌ Animation durations > 400ms  
❌ Auto-playing animations that loop  
