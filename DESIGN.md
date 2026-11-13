# DESIGN.md — xdfkenny modules (Soft Cryo)

Captured from `styles.css` (v20261020b). Single shared stylesheet for landing + library SPA.

## Theme & Color

Two themes via `html[data-theme="light|dark"]` (auto by default; pre-paint bootstrap in `<head>`; `localStorage.theme` override). OKLCH not used; committed hex tokens below are the source of truth — do not invent new colors.

### Light tokens
| Token | Value | Use |
|---|---|---|
| `--bg` | `#F0F7FF` | page bg (frosted gradient) |
| `--bg-warm` | `#F8FBFF` | cards, inputs, panels |
| `--fg` | `#2C3E50` | body text |
| `--fg-muted` | `#5A6D7E` | secondary text (≥4.5:1 on frost) |
| `--accent` | `#7EC8E3` | decorative ice, borders-strong |
| `--accent-dark` | `#4A9ECF` | hover accents, icons |
| `--accent-ink` | `#20648E` | AA-safe accent text on light surfaces |
| `--frost` | `#E1F5FE` | tinted fills, active chips |
| `--border` | `#C5E3F5` · `--border-strong` `#7EC8E3` | 1px card/control borders |
| `--mint` | `#A5D8C5` | Cufiy origin badge |
| `--status-ok/warn/fail` | `#4A9ECF` / `#9AA8E8` / `#C96F8E` | state colors |
| Primary gradient | `135deg, #2B7A9E → #20648E` | install buttons, active pills, badges (white text AA-safe) |

### Dark tokens
`--bg #0A0F1E`, `--bg-warm #141E32`, `--fg #E6EDF3`, `--fg-muted #8A9AB3`, `--accent-ink #8ED0F0`, `--frost #1E2D45`, `--border #2A3A52` / `#3A5575`. Dark overrides are per-selector blocks under `html[data-theme="dark"]` — new light styles need a dark counterpart.

Color strategy: **Restrained** — tinted neutrals + one icy blue accent; mint reserved for Cufiy origin; deep-blue gradient carries primary actions.

## Typography

| Role | Family | Notes |
|---|---|---|
| Display | Nunito 600–800 (`--font-display`) | h1–h3, brand, card titles |
| Body/UI | Inter (`--font-body`) | everything else |
| Mono | JetBrains Mono (`--font-mono`) | chips, badges, branch ids, eyebrows |

Scale: hero `clamp(44px, 9vw, 76px)` w800 ls-0.03em; section h2 `clamp(28px,4vw,36px)` w700 with 88px gradient underline; card title 16px; body 14–15px; labels 11–12px mono uppercase tracked. `text-wrap: balance` on headings, `pretty` on prose.

## Components

- **Buttons**: pill radius (`--r-full`). `.btn-primary` deep-blue gradient; `.btn-secondary` white fill + accent border; `.btn-ghost`/`.btn-soft`/`.btn-tiny` variants. Hover = scale(1.03) bounce or translateY(-1px).
- **Split install button** (`.split`): full-width add (gradient) + 58px copy segment, `r-md`, per-card.
- **Module card**: `--bg-warm`, 1px `--border`, `r-xl` (24px), shadow-sm→md on hover translateY(-4px); head (56px icon + title + version chip) / body (meta chips, updated stamp, author + app badges) / split button. Cufiy variant: mint badge, mint gradient action.
- **Filter pills** (`.filter-pill`): active = primary gradient + white text + `aria-pressed`; scrollable chip rows with drag-to-scroll.
- **Search**: 1.5px border, `r-xl`, glow focus, clear button, 16px font <640px (no iOS zoom).
- **States**: skeleton shimmer cards on load; `.empty` (icon + h3 + p) for no results; `.state-box` + spinner; toast (`role=status`).
- **Nav**: sticky frost blur bar, pill links, `aria-current="page"`; mobile dropdown ≤820px.
- **Modals**: donation modal (mobile landing only), focus moves to close, Esc + backdrop dismiss.

## Layout

Max width 1120px; section padding `clamp(56px,9vh,88px) clamp(16px,4vw,32px)`; grid `repeat(auto-fill, minmax(min(100%,300px),1fr))` gap 18px (280px ≤820px, 1fr ≤640px). Breakpoints: 820px (nav, grid), 768px (donate side → modal), 640px (single column, stats 2-up), 400px.

## Motion

`--ease-out cubic-bezier(.22,1,.36,1)` for transitions; `--ease-bounce` only for hover lift/press. Card entrance `cardPop 0.3s` staggered 30ms (≤10). Snow + floating hexes on hero only (JS-generated, skipped under reduced motion). Global `prefers-reduced-motion` kill-switch in CSS. No layout-property animation; transform/opacity only.

## Iconography

Material Symbols Outlined (ligatures) + Iconify `mdi:*` in pills; 16–20px; Passport Index SVG flags for languages. Icons decorative → `aria-hidden="true"`.
