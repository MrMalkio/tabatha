# Tabatha Design Protocol (v1.0.0)

> **Status:** Active
> **Version:** 1.0.0
> **Primary Directive:** This document is the absolute source of truth for Tabatha's UI/UX. The application must fully follow the tokens and rules defined here. If this document is updated, the application UI must follow suit.

---

## 1. Design Principles
Tabatha is an "Attention OS." The interface must serve to focus the user, not distract them.
- **Intentional Density:** Information should be dense but separated by clear borders and visual hierarchy.
- **Immediate Feedback:** All user actions (hover, click, drag) must provide immediate 100-200ms visual feedback.
- **Theme Fluidity:** The application must support swapping entire color and elevation paradigms via top-level data attributes.

---

## 2. Theme Architectures

The application uses CSS Variables injected via a top-level `[data-theme="..."]` attribute.

### Design Concept 1: "Pop Art + Glassmorphism" (Active)
**Vibe:** Vibrant, premium, cyberpunk-adjacent, stark contrasts.
- **Base Environment:** Endless dark void (`#050505`).
- **Surfaces:** Frosted glass (`backdrop-blur-xl` + 40% opacity black).
- **Accents:** Neon colors with hard, unblurred drop shadows.
- **Borders:** Thin, crisp translucent white borders to define glass edges.

### Design Concept 2: "Corporate Clean" (Alternate)
**Vibe:** Safe, accessible, high-contrast, strictly professional.
- **Base Environment:** Soft neutral gray/white (`#F8F9FA`).
- **Surfaces:** Solid white (`#FFFFFF`) with soft, diffused shadows (classic Material Design elevation).
- **Accents:** Trustworthy blues and muted charcoals.
- **Borders:** Subtle gray lines (`#E9ECEF`), no glass blur.

---

## 3. Global CSS Tokens

All UI components MUST use these semantic CSS variables rather than hardcoded colors.

### 3.1 Color Tokens

| Semantic Token | Concept 1 (Pop Art) | Concept 2 (Corporate) | Usage |
| :--- | :--- | :--- | :--- |
| `--color-bg-base` | `#050505` | `#F8F9FA` | Main application background |
| `--color-surface` | `rgba(20, 20, 25, 0.4)` | `#FFFFFF` | Cards, sidebars, panels |
| `--color-surface-hover` | `rgba(40, 40, 50, 0.6)` | `#F1F3F5` | Hover state for interactive surfaces |
| `--color-border` | `rgba(255, 255, 255, 0.1)` | `#DEE2E6` | Dividers and borders |
| `--color-text-primary`| `#FAFAFA` | `#212529` | Headings, core body text |
| `--color-text-muted` | `#868E96` | `#ADB5BD` | Timestamps, secondary labels |
| `--color-accent-primary`| `#00F0FF` (Cyan) | `#228BE6` (Blue) | Primary buttons, active tabs |
| `--color-accent-secondary`| `#FF0055` (Magenta) | `#495057` (Charcoal)| Warnings, secondary actions |
| `--color-accent-tertiary`| `#FFD700` (Yellow) | `#12B886` (Teal) | Success states, highlights |

### 3.2 Elevation & Shadow Tokens

| Semantic Token | Concept 1 (Pop Art) | Concept 2 (Corporate) | Usage |
| :--- | :--- | :--- | :--- |
| `--shadow-sm` | `none` | `0 1px 3px rgba(0,0,0,0.1)` | Small buttons, badges |
| `--shadow-md` | `none` | `0 4px 6px rgba(0,0,0,0.1)` | Standard cards |
| `--shadow-pop` | `4px 4px 0px var(--color-accent-secondary)` | `none` | High-impact interactive buttons |
| `--surface-blur` | `blur(16px)` | `none` | Applied to `--color-surface` |

---

## 4. Typography

**Primary Font Stack:** `'Inter', system-ui, sans-serif;`
**Display Font Stack:** `'Bebas Neue', 'Outfit', sans-serif;`

| Level | Size | Weight | Line Height | Letter Spacing |
| :--- | :--- | :--- | :--- | :--- |
| Display Large | `48px` | `700` | `1.1` | `0.05em` |
| Heading 1 | `32px` | `600` | `1.2` | `0em` |
| Heading 2 | `24px` | `600` | `1.3` | `0em` |
| Body Base | `14px` | `400` | `1.5` | `0em` |
| Caption/Micro | `11px` | `500` | `1.2` | `0.02em` |

---

## 5. Shape & Motion

### 5.1 Corner Radii (Shape)
- **`--radius-sm` (4px):** Inputs, small badges.
- **`--radius-md` (8px):** Standard buttons, tab items.
- **`--radius-lg` (16px):** Main layout panels, modals.
- **`--radius-full` (999px):** Avatars, priority dots.

### 5.2 Motion (Transitions)
- **Fast (`150ms ease-out`):** Hover states, color changes, border transitions.
- **Snappy (`200ms cubic-bezier(0.4, 0, 0.2, 1)`):** Button active presses (Pop Art translations).
- **Smooth (`300ms ease-in-out`):** Modal mounting, drawer sliding.

---

## 6. Implementation Protocol

When building React components in Tabatha:
1. **Never** hardcode colors. Always use the semantic CSS variables (e.g., `bg-[var(--color-surface)]`).
2. **Never** assume dark mode. The UI must respect the active theme applied to the root element.
3. Use Tailwind v4 standard spacing tokens (`p-4`, `gap-2`) rather than custom padding variables.
