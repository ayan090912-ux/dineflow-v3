# Dinely — Design System Specification

> **Version**: 2.0.0  
> **Target**: Multi-Tenant Restaurant Operating System & Consumer Dining Experience  
> **Philosophy**: Serious technology company meets beautifully designed restaurant. Confident, warm, editorial, fast, human.

---

## 1. Core Design Principles

1. **Hierarchy First, Decoration Never**: Typography, scale, and whitespace create visual clarity. Do not use borders, backgrounds, or cards where typography and spacing can do the work.
2. **Restaurant Grounded**: Dinely is built for kitchens, dining rooms, bars, and restaurateurs. It must evoke the craftsmanship of great hospitality: warm, precise, calm, and reliable.
3. **Operational Clarity**: In high-tempo environments (Kitchen, Bar, Waiter), every millisecond counts. Optimize for 10-foot legibility, large touch targets, and instant feedback. No decorative noise.
4. **Editorial Warmth for Diners**: The customer-facing menu must feel like sitting down at an exquisite restaurant, not filling out enterprise software. Beautiful culinary focus, elegant type, tactile menus.
5. **Calm Power for Owners**: Restaurant owners are managing a complex multi-million-dollar physical operation. The management dashboard must feel calm, organized, fast, and trustworthy like Linear and Stripe.

---

## 2. Color System

Dinely uses a curated, restrained color system with warm undertones that reflect restaurant culture (slate, warm bronze, deep ink) and strict semantic feedback colors.

### 2.1 Brand & Neutral Scale
| Token | Hex | HSL / CSS Var | Purpose |
| :--- | :--- | :--- | :--- |
| `--color-bg-canvas` | `#0b0d11` | `hsl(220, 20%, 5%)` | Deepest background canvas |
| `--color-bg-surface` | `#12151b` | `hsl(220, 20%, 9%)` | Primary container & card surface |
| `--color-bg-elevated` | `#1a1e27` | `hsl(220, 20%, 13%)` | Modals, dropdowns, elevated tooltips |
| `--color-border-subtle` | `#1e232e` | `hsl(220, 20%, 15%)` | Subtle dividers, inactive borders |
| `--color-border-strong` | `#2d3545` | `hsl(220, 20%, 22%)` | Input borders, interactive hover borders |
| `--color-text-primary` | `#f3f4f6` | `hsl(220, 14%, 96%)` | Primary headlines, critical figures |
| `--color-text-secondary` | `#9ca3af` | `hsl(220, 9%, 65%)` | Body copy, secondary descriptions |
| `--color-text-muted` | `#6b7280` | `hsl(220, 9%, 46%)` | Table headers, timestamps, metadata |
| `--color-brand-accent` | `#f97316` | `hsl(24, 94%, 53%)` | Culinary amber/warm flame accent |
| `--color-brand-warmth` | `#fbbf24` | `hsl(38, 92%, 50%)` | Secondary warm glow, highlight tone |

### 2.2 Semantic & Functional Colors
| Token | Hex | HSL | Operational Meaning |
| :--- | :--- | :--- | :--- |
| `--color-status-success` | `#10b981` | `hsl(160, 84%, 39%)` | Active restaurant, completed ticket, paid bill |
| `--color-status-warning` | `#f59e0b` | `hsl(38, 92%, 50%)` | Pending approval, ticket >15m, low stock |
| `--color-status-danger` | `#ef4444` | `hsl(0, 84%, 60%)` | Rejected, overdue ticket >25m, voided order |
| `--color-status-info` | `#3b82f6` | `hsl(217, 91%, 60%)` | System notices, active sync, informational |

---

## 3. Typography System

Typography carries 80% of Dinely's visual design. We eliminate arbitrary font sizes and use an intentional scale.

### 3.1 Typeface Families
- **Primary Interface Font**: `Inter`, `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Display & Editorial Headlines**: `Plus Jakarta Sans`, `Inter`, sans-serif (tracking `-0.03em`)
- **Operational & Monospace**: `JetBrains Mono`, `ui-monospace`, monospace (timers, order tickets, currencies, prices)

### 3.2 Type Scale
| Level | Font Size | Line Height | Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display** | `2.75rem` (44px) | `1.15` | `800` | `-0.03em` | Landing hero, major statements |
| **H1** | `2rem` (32px) | `1.2` | `700` | `-0.025em` | Page titles, venue names |
| **H2** | `1.5rem` (24px) | `1.25` | `650` | `-0.02em` | Section titles, modal headers |
| **H3** | `1.125rem` (18px) | `1.35` | `600` | `-0.015em` | Card titles, group headings |
| **Body Large** | `1rem` (16px) | `1.5` | `400 / 500`| `-0.01em` | Lead paragraphs, menu dish names |
| **Body** | `0.875rem` (14px) | `1.5` | `400 / 500`| `0` | Standard UI, table cells, form labels |
| **Small** | `0.75rem` (12px) | `1.4` | `500` | `+0.01em` | Metadata, badge text, helper hints |
| **Mono Metric** | `0.875rem` (14px) | `1.2` | `700` | `+0.02em` | Table #, ticket timers, prices (₹ / $) |

---

## 4. Spacing & Grid System

All layout dimensions, paddings, and gaps align to an **8pt rhythmic scale** (with 4pt half-steps for compact operational controls).

- `space-1` = `4px` (tight badge padding, icon gap)
- `space-2` = `8px` (button vertical padding, input padding)
- `space-3` = `12px` (compact card gap, list item gap)
- `space-4` = `16px` (standard card padding, grid gap)
- `space-6` = `24px` (container inner padding, section separation)
- `space-8` = `32px` (panel separation, modal content padding)
- `space-12` = `48px` (major section spacing)
- `space-16` = `64px` (landing page block rhythm)

### Border Radius Tokens
- `--radius-xs`: `4px` (checkboxes, tags)
- `--radius-sm`: `6px` (small badges, status pills)
- `--radius-md`: `10px` (inputs, buttons, dropdowns)
- `--radius-lg`: `14px` (cards, panels, modals)
- `--radius-xl`: `20px` (editorial hero containers)
- `--radius-full`: `9999px` (avatars, circular icon buttons)

---

## 5. Elevation & Shadows

We avoid heavy colored glow drops (`shadow-indigo-600/50`). Shadows in Dinely are deep, neutral, and sharp:

- `--shadow-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.4)`
- `--shadow-md`: `0 4px 12px -2px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)`
- `--shadow-lg`: `0 12px 28px -4px rgba(0, 0, 0, 0.65), 0 4px 8px -2px rgba(0, 0, 0, 0.4)`
- `--shadow-modal`: `0 24px 60px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)`

---

## 6. Motion & Micro-Interactions

Motion must communicate hierarchy or state change.
- **Fast Transitions** (`150ms cubic-bezier(0.4, 0, 0.2, 1)`): Button hover, dropdown open, focus rings.
- **Medium Transitions** (`250ms cubic-bezier(0.16, 1, 0.3, 1)`): Modal entrance, tab transitions, drawer slide.
- **Spring Transitions** (`damping: 24, stiffness: 300`): Live ticket bump, new order appearance, cart badge update.
- **Zero Distraction Rule**: No continuous spinning objects, no background particle grids, no floating glow balls.

---

## 7. Component Library Specifications

### 7.1 Buttons
- **Primary**: Deep obsidian surface with crisp 1px border or warm amber call-to-action (`bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold`). Active scale: `0.98`.
- **Secondary**: Clean slate surface with subtle border (`bg-surface border-subtle hover:border-strong text-slate-200`).
- **Ghost**: Pure transparent background with muted text that brightens on hover.
- **Danger**: Restrained crimson tint with crisp warning border (`bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20`).

### 7.2 Inputs & Forms
- High-contrast charcoal fill (`#0d0f14`), solid 1px border (`#222734`), crisp focus ring with 2px offset (`focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500`).
- Clear, permanent label above input; optional helper text below; inline validation errors with direct, human error text.

### 7.3 Badges & Status Indicators
- Replaced emoji indicators (`⏳`, `❌`, `🚀`) with crisp status dots and uppercase micro-labels (`0.65rem`, `font-mono`, `tracking-wider`).
- Example: `Active` = `1.5px emerald dot + "LIVE" text`.

### 7.4 Tables & Lists
- Thin, subtle dividers (`border-b border-subtle`).
- Monospace figures for dates, order numbers, and currency values with right-aligned numeric data.
- Row hover states that elevate slightly (`hover:bg-surface-elevated/40`).

---

## 8. Accessibility & Responsiveness

- **WCAG AA Compliance**: All text tokens achieve a minimum contrast ratio of 4.5:1 against their respective backgrounds.
- **Touch Targets**: Minimum 44x44px touch targets on mobile viewports for Waiter and Customer screens.
- **Prefers-Reduced-Motion**: Enforced across all animation hooks.
