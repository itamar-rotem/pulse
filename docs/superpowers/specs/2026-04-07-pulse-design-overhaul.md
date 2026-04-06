# Pulse Phase 2.1: Design System + Dashboard Overhaul

## Goal

Replace the current dark, characterless dashboard with a warm, light, personality-driven design system and rebuild every page in the web app. No new backend features — this is purely visual, using existing API data.

## Architecture

The overhaul replaces all components in `@pulse/web` while keeping the existing API contract unchanged. A new design system is built as CSS custom properties + a refreshed shadcn/ui component set. Recharts remains the charting library. SWR + WebSocket data layer is untouched.

## Design System

### Brand

- **Logo mark**: Rounded square (`border-radius: 9px`) with gradient fill (`#ff6b35` → `#e83f5b`), inner circle ring motif
- **Primary gradient**: `#ff6b35` (orange) → `#e83f5b` (coral)
- **Mode**: Light default. Dark mode deferred to later.
- **Personality**: Professional but alive — a developer tool with warmth and energy

### Color Tokens (CSS custom properties)

```css
:root {
  --bg: #faf9f7;
  --surface: #ffffff;
  --surface-hover: #f5f4f1;
  --border: #eae8e4;
  --border-light: #f0eeea;

  --text-1: #1a1a1a;
  --text-2: #8a857d;
  --text-3: #b5b0a8;

  --accent: #ff6b35;
  --accent-dark: #e83f5b;
  --accent-bg: #fff5f0;
  --accent-border: #ffd6cc;

  --green: #10b981;
  --green-bg: #ecfdf5;
  --green-border: #a7f3d0;

  --amber: #f59e0b;
  --amber-bg: #fffbeb;
  --amber-border: #fde68a;

  --red: #ef4444;
  --red-bg: #fef2f2;
  --red-border: #fecaca;

  --blue: #3b82f6;
  --blue-bg: #eff6ff;

  --purple: #8b5cf6;
  --purple-bg: #f5f3ff;
}
```

### Typography

- **Font stack**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Mono stack**: `'SF Mono', 'Cascadia Code', 'Fira Code', monospace` (for numbers, token counts, costs)
- **Scale**: 28px stat values, 24px page titles, 14px section headers, 13px body, 11px labels, 10px tags
- **Weights**: 800 (hero numbers), 700 (headings), 600 (emphasis/nav active), 500 (body)

### Component Primitives

| Component | Spec |
|-----------|------|
| Card | `border-radius: 20px`, `border: 1px solid var(--border)`, `box-shadow: 0 1px 3px rgba(0,0,0,0.03)` |
| Badge | `border-radius: 6px`, `padding: 2px 9px`, `font-size: 10px`, `font-weight: 600`. Variants: blue (human), purple (agent), green (healthy), amber (warning), red (danger) |
| Button Primary | Gradient fill (`--accent` → `--accent-dark`), `border-radius: 9px`, `box-shadow: 0 2px 8px rgba(255,107,53,0.25)`, white text |
| Button Ghost | `border: 1px solid var(--border)`, no fill, `--text-2` color |
| Status Dot | 8px circle, colored `box-shadow` glow (0 0 8px), CSS `pulse-dot` keyframe animation for live states |
| Stat Tag | Inline pill, `border-radius: 6px`, `padding: 2px 8px`, `font-size: 10px`, `font-weight: 600`, colored bg+text pairs |
| Sparkline | Inline mini bar chart, 3px wide bars, 16px max height, inside table cells. Color indicates health (blue normal, red spike) |
| Nav Item | `border-radius: 10px`, `padding: 9px 12px`, active state uses `--accent-bg` background with `--accent-border` and accent text color |
| Plan Card | Dark inverted card (`#1a1a1a` → `#2d2520` gradient), pinned to sidebar bottom, shows plan cost + value ratio |

### Animations

- `pulse-dot`: Status dots pulse glow for active sessions (`box-shadow` 0→6px→0, 2s infinite)
- `fade-in`: Cards fade in on page load (opacity 0→1, 0.2s)
- Hover transitions: 0.15s on nav items, session items, buttons
- Chart animations: Recharts built-in enter animations on mount

## Pages

### Layout Shell

Persistent sidebar (240px) on the left. Main content area scrollable. Sidebar contains:

1. **Logo** — gradient mark + "Pulse" text
2. **Monitor section** — Dashboard, Live View, Sessions
3. **Intelligence section** — Insights (with badge count), Alerts, Rules. These render as "coming soon" placeholder pages in this sub-project — the nav items exist so the structure is ready for Sub-project 2.
4. **Configure section** — Settings
5. **Plan card** — pinned to bottom, dark inverted, shows plan name, cost, value ratio

Header bar on each page shows: page title, subtitle with context (date, active count), and status pill ("Agent Connected" with animated green dot).

### Page 1: Dashboard (`/`)

The home view. Layout:

```
[Header: greeting + status pill]
[Hero row: Token Flow chart (60%) | Active Sessions panel (40%)]
[Stats strip: 4 cards — Sessions, Tokens, Cache Efficiency, API-Equivalent Value]
[Insight card: AI recommendation with accent left-border, dismiss/action buttons]
[Recent Sessions table: 5 rows with sparklines, badges, cost warnings]
```

**Token Flow chart**: SVG area chart (Recharts `AreaChart`) showing input + output tokens over time. Gradient fills under the lines. Time range tabs (24h / 7d / 30d). "Today" marker line. Legend below.

**Active Sessions panel**: List of live sessions, each with status dot (green/amber/red), project name, model, duration, cost, burn rate. Sorted by cost descending. Links to session detail.

**Stats strip**: 4 cards in a row.
- Sessions Today: count + human/agent tag breakdown
- Tokens Generated: total + in/out tags
- Cache Efficiency: percentage + progress bar + trend tag
- API-Equivalent Value: dark inverted card, shows value + plan cost + ROI multiplier

**Insight card**: Left accent border (gradient), icon, title, description, Dismiss + action CTA buttons. In this sub-project, this is a static/mock card. Sub-project 2 will make it dynamic.

**Recent Sessions table**: Columns: Project (bold), Type (badge), Model, Duration, Tokens (mono + sparkline), Value (cost, red if anomalous). Clickable rows → session detail. "View all →" link to `/sessions`.

### Page 2: Live View (`/live`)

Real-time view of active sessions.

**Header**: "Live View" + count pill ("5 active")

**Session cards grid**: Responsive grid of cards, one per active session. Each card contains:
- Status dot + project name + model badge
- Ring gauge (SVG donut) showing token consumption rate, color-coded by status
- Cost, duration, burn rate (tokens/min)
- Session type badge (human/agent)
- Card border color reflects status: green (normal), amber (elevated), red (hot)

**Token stream**: Below the cards, a real-time scrolling log showing individual token events as they arrive via WebSocket. Each line: timestamp, project, token delta, cost delta, burn rate. New events animate in from top.

Data source: WebSocket `token_event` messages for the stream, SWR `/api/dashboard/live-summary` (5s refresh) for the cards. Ring gauge values derived from `burnRatePerMin` relative to a configurable baseline.

### Page 3: Sessions (`/sessions`)

Paginated session history with filters.

**Filters bar**: Pill/dropdown filters for:
- Session type: All / Human / Agent
- Project: dropdown of known project slugs
- Model: dropdown of known models
- Time range: 24h / 7d / 30d / Custom

**Table**: Columns: Project, Type (badge), Model, Started, Duration, Tokens (mono + sparkline), Value. Sortable by any column. Clickable rows → `/sessions/[id]`.

**Pagination**: Bottom of table, standard prev/next with page numbers.

### Page 4: Session Detail (`/sessions/[id]`)

Deep dive into one session.

**Back link**: "← Back to Sessions"

**Session header**: Project name, model, session type badge, started timestamp, status (active/ended).

**Stat cards row**: Duration, Total Tokens, Total Value (3 cards).

**Cost over time chart**: Recharts `LineChart` showing cumulative cost on Y-axis, time on X-axis. Burn rate as secondary Y-axis (dashed line). Tooltip shows exact values on hover.

**Token breakdown chart**: Recharts `AreaChart` with stacked areas: input tokens, output tokens, cache read tokens, cache creation tokens. Shows how the token mix evolves over the session.

**Token events table**: Scrollable table of every token event. Columns: Timestamp, Input, Output, Cache Read, Cost Delta, Cumulative Cost, Burn Rate.

### Page 5: Insights (`/insights`) — Placeholder

"Coming soon" page with:
- Icon + "Intelligence features are coming" heading
- Brief description of what Insights, Alerts, and Rules will do
- Visual preview: 2-3 mock insight cards showing the kind of recommendations the system will generate (static, not connected to data)

Same treatment for `/alerts` and `/rules`.

### Page 6: Settings (`/settings`)

- **Plan section**: Plan name, monthly cost, value ratio, link to billing
- **Agent section**: Connection status, agent version, last seen timestamp, API endpoint URL
- **Display section**: Timezone picker, number format (tokens: k/M/B vs raw), currency display
- **Notifications section**: Placeholder for Sub-project 2 — "Configure alerts and notifications in the Alerts page (coming soon)"

## Technical Approach

### File Structure Changes

All changes are in `packages/web/`:

```
src/
  app/
    layout.tsx          — update: new sidebar, global styles
    page.tsx            — rewrite: dashboard home
    live/page.tsx       — rewrite: live view
    sessions/page.tsx   — rewrite: session history
    sessions/[id]/page.tsx — rewrite: session detail
    insights/page.tsx   — new: placeholder
    alerts/page.tsx     — new: placeholder
    rules/page.tsx      — new: placeholder
    settings/page.tsx   — rewrite: settings
    globals.css         — rewrite: design tokens, base styles
  components/
    layout/
      sidebar.tsx       — rewrite: new sidebar with sections, plan card
      header.tsx        — rewrite: greeting + status pill
    ui/
      card.tsx          — update: new border-radius, shadows
      badge.tsx         — update: new color variants
      button.tsx        — update: gradient primary, ghost variant
      table.tsx         — update: new styling
      progress.tsx      — keep as-is
      separator.tsx     — keep as-is
      status-dot.tsx    — new: animated status indicator
      stat-card.tsx     — new: stat display with value, tags, bar
      stat-tag.tsx      — new: colored inline pill
      sparkline.tsx     — new: inline mini bar chart
      ring-gauge.tsx    — new: SVG donut gauge for live view
      nav-item.tsx      — new: sidebar navigation item
      plan-card.tsx     — new: dark inverted plan display
      insight-card.tsx  — new: recommendation card with accent bar
      page-header.tsx   — new: page title + subtitle + actions
      coming-soon.tsx   — new: placeholder for unreleased features
    live/
      today-summary.tsx — rewrite: stats strip
      token-flow-chart.tsx — new: area chart with gradient fills
      active-sessions.tsx — new: live session list panel
      session-card.tsx  — new: live view card with ring gauge
      token-stream.tsx  — new: real-time event log
    sessions/
      session-table.tsx — rewrite: with sparklines, badges
      session-filters.tsx — new: filter bar
      session-detail.tsx — rewrite: charts + event table
      cost-chart.tsx    — new: cumulative cost line chart
      token-breakdown-chart.tsx — new: stacked area chart
  hooks/
    use-sessions.ts     — keep: existing SWR hooks
    use-websocket.ts    — keep: existing WebSocket hook
  lib/
    api.ts              — keep: existing fetch wrapper
    utils.ts            — update: add formatTokens, formatCost, formatDuration helpers
    design-tokens.ts    — new: exported color/spacing constants for charts
```

### No Backend Changes

This sub-project changes zero files in `@pulse/api`, `@pulse/agent`, or `@pulse/shared`. All data comes from existing endpoints:
- `GET /api/dashboard/live-summary` — dashboard stats + active sessions
- `GET /api/sessions/history` — paginated session list
- `GET /api/sessions/:id` — session detail with token events
- WebSocket `ws://localhost:3001/ws?role=dashboard` — real-time token events

### Chart Library

Recharts (already installed) for all charts:
- `AreaChart` with `linearGradient` fills for Token Flow and Token Breakdown
- `LineChart` with dual Y-axis for Cost Over Time
- Custom SVG `RingGauge` component (not Recharts) for the live view donut gauges

### Formatting Utilities

Add to `lib/utils.ts`:
- `formatTokens(n)`: 1000→"1k", 1000000→"1M", 1000000000→"1B"
- `formatCost(n)`: $0.012→"$0.01", $139.92→"$139.92", $3786→"$3.8k"
- `formatDuration(startedAt, endedAt?)`: "2h 14m", "45m", "Active"
- `formatRelativeTime(timestamp)`: "2 minutes ago", "1 hour ago"
- `getBurnRateStatus(rate, baseline?)`: returns "healthy" | "warning" | "hot"

## What This Does NOT Include

- No new API endpoints
- No authentication/multi-user (Sub-project 3)
- No real AI-powered insights (Sub-project 2) — the insight card is static/mock
- No dark mode toggle (deferred)
- No mobile responsive layout (desktop-first for now)
- No export/CSV functionality (deferred)
