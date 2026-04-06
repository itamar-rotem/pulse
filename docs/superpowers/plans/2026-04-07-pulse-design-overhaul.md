# Pulse Design System + Dashboard Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark, characterless dashboard with a warm, light, personality-driven design system and rebuild every page in the web app.

**Architecture:** All changes are in `packages/web/`. New CSS custom properties define the design tokens. Existing shadcn/ui components get updated styling. New components (status-dot, sparkline, ring-gauge, etc.) are added. All 6 pages are rewritten. No backend changes — same API contract.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, shadcn/ui (base-nova style), Recharts, SWR, WebSocket, vitest (new for web package)

**Important:** The `packages/web/AGENTS.md` says: "This is NOT the Next.js you know. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code." Check Next.js 16 docs for any breaking changes before implementing route pages.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/design-tokens.ts` | Exported color/spacing constants for Recharts charts |
| `src/lib/format.ts` | `formatTokens`, `formatCost`, `formatDuration`, `formatRelativeTime`, `getBurnRateStatus` |
| `src/lib/__tests__/format.test.ts` | Unit tests for formatting utilities |
| `src/components/ui/status-dot.tsx` | Animated status indicator (green/amber/red with pulse glow) |
| `src/components/ui/stat-card.tsx` | Stat display card with value, label, tags, optional bar |
| `src/components/ui/stat-tag.tsx` | Colored inline pill for tag display |
| `src/components/ui/sparkline.tsx` | Inline mini bar chart for table cells |
| `src/components/ui/ring-gauge.tsx` | SVG donut gauge for live view |
| `src/components/ui/nav-item.tsx` | Sidebar navigation item with active state |
| `src/components/ui/plan-card.tsx` | Dark inverted plan display for sidebar bottom |
| `src/components/ui/insight-card.tsx` | Recommendation card with accent left border |
| `src/components/ui/page-header.tsx` | Page title + subtitle + status pill + actions |
| `src/components/ui/coming-soon.tsx` | Placeholder page for unreleased features |
| `src/components/live/token-flow-chart.tsx` | Area chart with gradient fills for dashboard hero |
| `src/components/live/active-sessions.tsx` | Live session list panel (dashboard right column) |
| `src/components/live/session-card.tsx` | Live view card with ring gauge + status border |
| `src/components/live/token-stream.tsx` | Real-time scrolling token event log |
| `src/components/sessions/session-filters.tsx` | Filter bar for session history (type, project, model, time) |
| `src/components/sessions/cost-chart.tsx` | Cumulative cost line chart with burn rate |
| `src/components/sessions/token-breakdown-chart.tsx` | Stacked area chart for token mix |
| `src/app/insights/page.tsx` | Coming soon placeholder |
| `src/app/alerts/page.tsx` | Coming soon placeholder |
| `src/app/rules/page.tsx` | Coming soon placeholder |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/globals.css` | Complete rewrite — new design tokens, animations, base styles |
| `src/app/layout.tsx` | Remove Geist fonts, use system font stack, update body classes |
| `src/app/page.tsx` | Complete rewrite — new dashboard layout |
| `src/app/live/page.tsx` | Complete rewrite — session cards grid + token stream |
| `src/app/sessions/page.tsx` | Rewrite — add filters bar, new styling |
| `src/app/sessions/[id]/page.tsx` | Rewrite — new charts + event table |
| `src/app/settings/page.tsx` | Rewrite — plan, agent, display, notifications sections |
| `src/components/layout/sidebar.tsx` | Complete rewrite — sections, plan card, new nav items |
| `src/components/layout/header.tsx` | Rewrite — greeting + status pill |
| `src/components/ui/card.tsx` | Update border-radius to 20px, new shadow, warm border |
| `src/components/ui/badge.tsx` | Add color variants (blue/purple/green/amber/red) |
| `src/components/ui/button.tsx` | Add gradient primary, update ghost variant |
| `src/components/ui/table.tsx` | Update styling for warm theme |
| `src/components/live/today-summary.tsx` | Complete rewrite — 4 stat cards with new design |
| `src/components/sessions/session-table.tsx` | Rewrite — add sparklines, badges, cost warnings |
| `src/components/sessions/session-detail.tsx` | Rewrite — new charts + event table |
| `src/lib/utils.ts` | Keep as-is (cn utility stays) |
| `src/hooks/use-sessions.ts` | Keep as-is |
| `src/hooks/use-websocket.ts` | Keep as-is |
| `src/lib/api.ts` | Keep as-is |
| `package.json` | Add vitest + lucide-react dev/dependencies |

### Files to Delete
| File | Reason |
|------|--------|
| `src/components/live/token-gauge.tsx` | Replaced by `ring-gauge.tsx` |
| `src/components/live/burn-rate.tsx` | Functionality merged into session-card and stat-card |
| `src/components/live/cost-meter.tsx` | Functionality merged into stat-card |
| `src/components/live/active-session-panel.tsx` | Replaced by `active-sessions.tsx` (list panel) and `session-card.tsx` |

---

## Task 1: Design Foundation — Global Styles + Design Tokens

**Files:**
- Rewrite: `packages/web/src/app/globals.css`
- Create: `packages/web/src/lib/design-tokens.ts`
- Modify: `packages/web/src/app/layout.tsx`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Install lucide-react for icons**

```bash
cd packages/web && pnpm add lucide-react
```

- [ ] **Step 2: Rewrite globals.css with design tokens and animations**

Replace the entire contents of `packages/web/src/app/globals.css`:

```css
@import "tailwindcss";

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

  /* shadcn/ui token overrides */
  --background: var(--bg);
  --foreground: var(--text-1);
  --card: var(--surface);
  --card-foreground: var(--text-1);
  --primary: var(--accent);
  --primary-foreground: #ffffff;
  --secondary: var(--accent-bg);
  --secondary-foreground: var(--accent);
  --muted: var(--surface-hover);
  --muted-foreground: var(--text-2);
  --border: var(--border);
  --input: var(--border);
  --ring: var(--accent);
  --destructive: var(--red);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
}

/* Animations */
@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; }
  50% { box-shadow: 0 0 8px 2px currentColor; }
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

body {
  background: var(--bg);
  color: var(--text-1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Card fade-in on page load */
[data-slot="card"] {
  animation: fade-in 0.2s ease-out;
}
```

- [ ] **Step 3: Create design-tokens.ts for chart colors**

Create `packages/web/src/lib/design-tokens.ts`:

```typescript
/** Design token constants for use in Recharts and inline SVG */

export const colors = {
  accent: '#ff6b35',
  accentDark: '#e83f5b',
  accentBg: '#fff5f0',

  green: '#10b981',
  greenBg: '#ecfdf5',
  amber: '#f59e0b',
  amberBg: '#fffbeb',
  red: '#ef4444',
  redBg: '#fef2f2',

  blue: '#3b82f6',
  blueBg: '#eff6ff',
  purple: '#8b5cf6',
  purpleBg: '#f5f3ff',

  text1: '#1a1a1a',
  text2: '#8a857d',
  text3: '#b5b0a8',
  border: '#eae8e4',
  surface: '#ffffff',
  bg: '#faf9f7',
} as const;

export const chartColors = {
  inputTokens: colors.blue,
  outputTokens: colors.purple,
  cacheRead: colors.green,
  cacheCreation: colors.amber,
  cost: colors.accent,
  burnRate: colors.red,
  grid: colors.border,
  axis: colors.text3,
} as const;
```

- [ ] **Step 4: Update layout.tsx — remove Geist fonts, use system stack**

Replace the entire contents of `packages/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "Pulse — AI Dev Health Monitor",
  description: "Real-time token consumption monitoring for AI coding tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full flex"
        style={{ background: 'var(--bg)', color: 'var(--text-1)' }}
      >
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Verify the app compiles**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds (pages will look broken — that's fine, we're changing styling incrementally).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/app/globals.css packages/web/src/lib/design-tokens.ts packages/web/src/app/layout.tsx packages/web/package.json packages/web/pnpm-lock.yaml
git commit -m "feat(web): add design system tokens, animations, and system font stack"
```

---

## Task 2: Formatting Utilities (TDD)

**Files:**
- Create: `packages/web/src/lib/format.ts`
- Create: `packages/web/src/lib/__tests__/format.test.ts`
- Modify: `packages/web/package.json` (add vitest)

- [ ] **Step 1: Add vitest to web package**

```bash
cd packages/web && pnpm add -D vitest
```

Add test script to `packages/web/package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write failing tests for all formatters**

Create `packages/web/src/lib/__tests__/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatTokens,
  formatCost,
  formatDuration,
  formatRelativeTime,
  getBurnRateStatus,
} from '../format';

describe('formatTokens', () => {
  it('formats small numbers as-is', () => {
    expect(formatTokens(500)).toBe('500');
  });
  it('formats thousands as k', () => {
    expect(formatTokens(1000)).toBe('1k');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(42300)).toBe('42.3k');
  });
  it('formats millions as M', () => {
    expect(formatTokens(1000000)).toBe('1M');
    expect(formatTokens(3200000)).toBe('3.2M');
  });
  it('formats billions as B', () => {
    expect(formatTokens(1000000000)).toBe('1B');
    expect(formatTokens(2500000000)).toBe('2.5B');
  });
  it('handles zero', () => {
    expect(formatTokens(0)).toBe('0');
  });
});

describe('formatCost', () => {
  it('formats small costs with 2 decimal places', () => {
    expect(formatCost(0.012)).toBe('$0.01');
    expect(formatCost(1.50)).toBe('$1.50');
  });
  it('formats medium costs with 2 decimal places', () => {
    expect(formatCost(139.92)).toBe('$139.92');
  });
  it('formats large costs as k', () => {
    expect(formatCost(3786)).toBe('$3.8k');
    expect(formatCost(12500)).toBe('$12.5k');
  });
  it('handles zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });
});

describe('formatDuration', () => {
  it('formats minutes-only durations', () => {
    const start = '2026-04-07T10:00:00Z';
    const end = '2026-04-07T10:45:00Z';
    expect(formatDuration(start, end)).toBe('45m');
  });
  it('formats hours + minutes', () => {
    const start = '2026-04-07T10:00:00Z';
    const end = '2026-04-07T12:14:00Z';
    expect(formatDuration(start, end)).toBe('2h 14m');
  });
  it('returns Active when no end time', () => {
    const start = '2026-04-07T10:00:00Z';
    expect(formatDuration(start, null)).toBe('Active');
    expect(formatDuration(start, undefined)).toBe('Active');
  });
  it('handles zero duration', () => {
    const start = '2026-04-07T10:00:00Z';
    expect(formatDuration(start, start)).toBe('0m');
  });
});

describe('formatRelativeTime', () => {
  it('formats seconds ago', () => {
    const now = new Date();
    const thirtySecsAgo = new Date(now.getTime() - 30000).toISOString();
    expect(formatRelativeTime(thirtySecsAgo)).toBe('just now');
  });
  it('formats minutes ago', () => {
    const now = new Date();
    const twoMinsAgo = new Date(now.getTime() - 120000).toISOString();
    expect(formatRelativeTime(twoMinsAgo)).toBe('2 minutes ago');
  });
  it('formats hours ago', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
  });
});

describe('getBurnRateStatus', () => {
  it('returns healthy for normal rates', () => {
    expect(getBurnRateStatus(500)).toBe('healthy');
  });
  it('returns warning for elevated rates', () => {
    expect(getBurnRateStatus(1500)).toBe('warning');
  });
  it('returns hot for high rates', () => {
    expect(getBurnRateStatus(3000)).toBe('hot');
  });
  it('uses custom baseline', () => {
    expect(getBurnRateStatus(200, 100)).toBe('warning');
    expect(getBurnRateStatus(300, 100)).toBe('hot');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd packages/web && pnpm test
```

Expected: FAIL — module `../format` not found.

- [ ] **Step 4: Implement all formatting utilities**

Create `packages/web/src/lib/format.ts`:

```typescript
/**
 * Format a token count to a human-readable string.
 * 1000 → "1k", 1000000 → "1M", 1000000000 → "1B"
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${+(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

/**
 * Format a USD cost value.
 * $0.012 → "$0.01", $139.92 → "$139.92", $3786 → "$3.8k"
 */
export function formatCost(n: number): string {
  if (n >= 1000) return `$${+(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

/**
 * Format a duration between two ISO timestamps.
 * Returns "Active" if endedAt is null/undefined.
 */
export function formatDuration(
  startedAt: string,
  endedAt?: string | null,
): string {
  if (!endedAt) return 'Active';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Format a timestamp as relative time ("2 minutes ago", "1 hour ago").
 */
export function formatRelativeTime(timestamp: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000,
  );
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Classify burn rate as healthy/warning/hot.
 * Default baseline: 1000 tokens/min.
 */
export function getBurnRateStatus(
  rate: number,
  baseline = 1000,
): 'healthy' | 'warning' | 'hot' {
  const ratio = rate / baseline;
  if (ratio >= 2.5) return 'hot';
  if (ratio >= 1.5) return 'warning';
  return 'healthy';
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/web && pnpm test
```

Expected: All 16 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/format.ts packages/web/src/lib/__tests__/format.test.ts packages/web/package.json
git commit -m "feat(web): add formatting utilities with tests (formatTokens, formatCost, formatDuration, etc.)"
```

---

## Task 3: New UI Primitives — Batch 1

**Files:**
- Create: `packages/web/src/components/ui/status-dot.tsx`
- Create: `packages/web/src/components/ui/stat-tag.tsx`
- Create: `packages/web/src/components/ui/stat-card.tsx`
- Create: `packages/web/src/components/ui/page-header.tsx`

- [ ] **Step 1: Create status-dot component**

Create `packages/web/src/components/ui/status-dot.tsx`:

```tsx
import { cn } from '@/lib/utils';

type StatusDotVariant = 'green' | 'amber' | 'red';

interface StatusDotProps {
  variant?: StatusDotVariant;
  pulse?: boolean;
  className?: string;
}

const variantColors: Record<StatusDotVariant, string> = {
  green: 'bg-[var(--green)] text-[var(--green)]',
  amber: 'bg-[var(--amber)] text-[var(--amber)]',
  red: 'bg-[var(--red)] text-[var(--red)]',
};

export function StatusDot({
  variant = 'green',
  pulse = false,
  className,
}: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full shrink-0',
        variantColors[variant],
        pulse && 'animate-[pulse-dot_2s_infinite]',
        className,
      )}
    />
  );
}
```

- [ ] **Step 2: Create stat-tag component**

Create `packages/web/src/components/ui/stat-tag.tsx`:

```tsx
import { cn } from '@/lib/utils';

type StatTagVariant = 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'neutral';

interface StatTagProps {
  variant?: StatTagVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<StatTagVariant, string> = {
  blue: 'bg-[var(--blue-bg)] text-[var(--blue)]',
  purple: 'bg-[var(--purple-bg)] text-[var(--purple)]',
  green: 'bg-[var(--green-bg)] text-[var(--green)]',
  amber: 'bg-[var(--amber-bg)] text-[var(--amber)]',
  red: 'bg-[var(--red-bg)] text-[var(--red)]',
  neutral: 'bg-[var(--surface-hover)] text-[var(--text-2)]',
};

export function StatTag({ variant = 'neutral', children, className }: StatTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Create stat-card component**

Create `packages/web/src/components/ui/stat-card.tsx`:

```tsx
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  children?: React.ReactNode;
  inverted?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  children,
  inverted = false,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-[20px] border p-5 transition-colors',
        inverted
          ? 'bg-gradient-to-br from-[#1a1a1a] to-[#2d2520] border-[#1a1a1a] text-white'
          : 'bg-[var(--surface)] border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]',
        className,
      )}
    >
      <p
        className={cn(
          'text-[11px] font-medium mb-1',
          inverted ? 'text-white/60' : 'text-[var(--text-2)]',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'text-[28px] font-extrabold font-mono leading-tight',
          inverted ? 'text-white' : 'text-[var(--text-1)]',
        )}
      >
        {value}
      </p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Create page-header component**

Create `packages/web/src/components/ui/page-header.tsx`:

```tsx
import { StatusDot } from './status-dot';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  connected?: boolean;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  connected,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)]">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-1)]">{title}</h1>
        {subtitle && (
          <p className="text-[13px] text-[var(--text-2)] mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {connected !== undefined && (
          <div className="flex items-center gap-2 rounded-full border border-[var(--green-border)] bg-[var(--green-bg)] px-3 py-1">
            <StatusDot variant="green" pulse={connected} />
            <span className="text-xs font-semibold text-[var(--green)]">
              {connected ? 'Agent Connected' : 'Disconnected'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify the app compiles**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds. New components exist but aren't imported by any page yet.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ui/status-dot.tsx packages/web/src/components/ui/stat-tag.tsx packages/web/src/components/ui/stat-card.tsx packages/web/src/components/ui/page-header.tsx
git commit -m "feat(web): add UI primitives — StatusDot, StatTag, StatCard, PageHeader"
```

---

## Task 4: New UI Primitives — Batch 2

**Files:**
- Create: `packages/web/src/components/ui/sparkline.tsx`
- Create: `packages/web/src/components/ui/ring-gauge.tsx`
- Create: `packages/web/src/components/ui/nav-item.tsx`
- Create: `packages/web/src/components/ui/plan-card.tsx`
- Create: `packages/web/src/components/ui/insight-card.tsx`
- Create: `packages/web/src/components/ui/coming-soon.tsx`

- [ ] **Step 1: Create sparkline component**

Create `packages/web/src/components/ui/sparkline.tsx`:

```tsx
interface SparklineProps {
  data: number[];
  color?: string;
  spikeColor?: string;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  color = 'var(--blue)',
  spikeColor = 'var(--red)',
  height = 16,
  className,
}: SparklineProps) {
  if (data.length === 0) return null;

  const max = Math.max(...data);
  const threshold = max * 0.85;
  const barWidth = 3;
  const gap = 1;
  const width = data.length * (barWidth + gap) - gap;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {data.map((value, i) => {
        const barHeight = max > 0 ? (value / max) * height : 0;
        const isSpike = value >= threshold && max > 0;
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            fill={isSpike ? spikeColor : color}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Create ring-gauge component**

Create `packages/web/src/components/ui/ring-gauge.tsx`:

```tsx
import { cn } from '@/lib/utils';

interface RingGaugeProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
  children?: React.ReactNode;
}

export function RingGauge({
  value,
  max,
  size = 80,
  strokeWidth = 6,
  color = 'var(--green)',
  className,
  children,
}: RingGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = max > 0 ? Math.min(value / max, 1) : 0;
  const strokeDashoffset = circumference * (1 - percentage);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create nav-item component**

Create `packages/web/src/components/ui/nav-item.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export function NavItem({ href, label, icon: Icon, badge }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-[10px] px-3 py-[9px] text-[13px] font-medium transition-colors duration-150',
        isActive
          ? 'bg-[var(--accent-bg)] border border-[var(--accent-border)] text-[var(--accent)] font-semibold'
          : 'text-[var(--text-2)] hover:bg-[var(--surface-hover)] border border-transparent',
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-[var(--accent)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: Create plan-card component**

Create `packages/web/src/components/ui/plan-card.tsx`:

```tsx
interface PlanCardProps {
  planName: string;
  monthlyCost: number;
  totalValue: number;
}

export function PlanCard({ planName, monthlyCost, totalValue }: PlanCardProps) {
  const ratio = monthlyCost > 0 ? Math.round(totalValue / monthlyCost) : 0;

  return (
    <div className="rounded-[14px] bg-gradient-to-br from-[#1a1a1a] to-[#2d2520] p-4 text-white">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-2">
        Your Plan
      </p>
      <p className="text-sm font-bold">{planName}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-lg font-extrabold font-mono">${monthlyCost}</span>
        <span className="text-[10px] text-white/50">/mo</span>
      </div>
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/50">Value ratio</span>
          <span className="text-sm font-bold font-mono text-[var(--green)]">
            {ratio}x
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create insight-card component**

Create `packages/web/src/components/ui/insight-card.tsx`:

```tsx
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface InsightCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function InsightCard({
  icon: Icon,
  title,
  description,
  onDismiss,
  actionLabel,
  onAction,
  className,
}: InsightCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 pl-7 shadow-[0_1px_3px_rgba(0,0,0,0.03)]',
        className,
      )}
    >
      {/* Accent left border */}
      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent-dark)]" />

      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 rounded-lg bg-[var(--accent-bg)] p-2">
          <Icon size={16} className="text-[var(--accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-1)]">{title}</p>
          <p className="text-[13px] text-[var(--text-2)] mt-1">{description}</p>
          <div className="flex items-center gap-2 mt-3">
            {actionLabel && onAction && (
              <button
                onClick={onAction}
                className="rounded-[9px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(255,107,53,0.25)] transition-opacity hover:opacity-90"
              >
                {actionLabel}
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="rounded-[9px] border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create coming-soon component**

Create `packages/web/src/components/ui/coming-soon.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
  previewCards?: Array<{
    title: string;
    description: string;
  }>;
}

export function ComingSoon({
  icon: Icon,
  title,
  description,
  previewCards,
}: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 max-w-lg mx-auto text-center">
      <div className="rounded-2xl bg-[var(--accent-bg)] p-4 mb-6">
        <Icon size={32} className="text-[var(--accent)]" />
      </div>
      <h2 className="text-2xl font-bold text-[var(--text-1)] mb-2">{title}</h2>
      <p className="text-[13px] text-[var(--text-2)] leading-relaxed">
        {description}
      </p>

      {previewCards && previewCards.length > 0 && (
        <div className="mt-8 w-full space-y-3">
          {previewCards.map((card, i) => (
            <div
              key={i}
              className="relative rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4 pl-6 text-left opacity-60"
            >
              <div className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent-dark)]" />
              <p className="text-sm font-semibold text-[var(--text-1)]">
                {card.title}
              </p>
              <p className="text-[12px] text-[var(--text-2)] mt-1">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify the app compiles**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/ui/sparkline.tsx packages/web/src/components/ui/ring-gauge.tsx packages/web/src/components/ui/nav-item.tsx packages/web/src/components/ui/plan-card.tsx packages/web/src/components/ui/insight-card.tsx packages/web/src/components/ui/coming-soon.tsx
git commit -m "feat(web): add UI primitives — Sparkline, RingGauge, NavItem, PlanCard, InsightCard, ComingSoon"
```

---

## Task 5: Update Existing UI Components

**Files:**
- Modify: `packages/web/src/components/ui/card.tsx`
- Modify: `packages/web/src/components/ui/badge.tsx`
- Modify: `packages/web/src/components/ui/button.tsx`
- Modify: `packages/web/src/components/ui/table.tsx`

- [ ] **Step 1: Update card.tsx with new border-radius and shadows**

In `packages/web/src/components/ui/card.tsx`, replace the Card function's className string:

Old:
```
"group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl"
```

New:
```
"group/card flex flex-col gap-4 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] py-4 text-sm text-[var(--text-1)] shadow-[0_1px_3px_rgba(0,0,0,0.03)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-[20px] *:[img:last-child]:rounded-b-[20px]"
```

- [ ] **Step 2: Update badge.tsx with color variants**

In `packages/web/src/components/ui/badge.tsx`, add new variants to the `badgeVariants` object. Replace the entire `variants.variant` object:

```typescript
variant: {
  default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
  secondary:
    "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
  destructive:
    "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
  outline:
    "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
  ghost:
    "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
  link: "text-primary underline-offset-4 hover:underline",
  blue: "bg-[var(--blue-bg)] text-[var(--blue)] border-transparent",
  purple: "bg-[var(--purple-bg)] text-[var(--purple)] border-transparent",
  green: "bg-[var(--green-bg)] text-[var(--green)] border-transparent",
  amber: "bg-[var(--amber-bg)] text-[var(--amber)] border-transparent",
  red: "bg-[var(--red-bg)] text-[var(--red)] border-transparent",
},
```

- [ ] **Step 3: Update button.tsx with gradient primary**

In `packages/web/src/components/ui/button.tsx`, replace the `default` variant in `variants.variant`:

Old:
```
default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
```

New:
```
default: "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] text-white shadow-[0_2px_8px_rgba(255,107,53,0.25)] [a]:hover:opacity-90",
```

- [ ] **Step 4: Update table.tsx with warm theme styling**

In `packages/web/src/components/ui/table.tsx`, update `TableRow` hover and `TableHead` colors.

Replace the TableRow className:
```
"border-b border-[var(--border-light)] transition-colors hover:bg-[var(--surface-hover)] has-aria-expanded:bg-[var(--surface-hover)] data-[state=selected]:bg-[var(--accent-bg)]"
```

Replace the TableHead className:
```
"h-10 px-2 text-left align-middle font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap text-[var(--text-2)] [&:has([role=checkbox])]:pr-0"
```

- [ ] **Step 5: Verify the app compiles**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ui/card.tsx packages/web/src/components/ui/badge.tsx packages/web/src/components/ui/button.tsx packages/web/src/components/ui/table.tsx
git commit -m "feat(web): update Card, Badge, Button, Table with warm design system styling"
```

---

## Task 6: Layout Shell — Sidebar + Header Rewrite

**Files:**
- Rewrite: `packages/web/src/components/layout/sidebar.tsx`
- Rewrite: `packages/web/src/components/layout/header.tsx`

- [ ] **Step 1: Rewrite sidebar.tsx with sections, icons, and plan card**

Replace the entire contents of `packages/web/src/components/layout/sidebar.tsx`:

```tsx
'use client';

import {
  LayoutDashboard,
  Radio,
  History,
  Lightbulb,
  Bell,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import { NavItem } from '@/components/ui/nav-item';
import { PlanCard } from '@/components/ui/plan-card';
import { useLiveSummary } from '@/hooks/use-sessions';

export function Sidebar() {
  const { data: summary } = useLiveSummary();
  const totalValue = summary?.totalCostToday ?? 0;

  return (
    <aside className="w-[240px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div
            className="size-8 rounded-[9px] flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="white" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <span className="text-[17px] font-bold text-[var(--text-1)]">Pulse</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-6 overflow-y-auto">
        {/* Monitor */}
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Monitor
          </p>
          <div className="space-y-0.5">
            <NavItem href="/" label="Dashboard" icon={LayoutDashboard} />
            <NavItem href="/live" label="Live View" icon={Radio} />
            <NavItem href="/sessions" label="Sessions" icon={History} />
          </div>
        </div>

        {/* Intelligence */}
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Intelligence
          </p>
          <div className="space-y-0.5">
            <NavItem href="/insights" label="Insights" icon={Lightbulb} badge={3} />
            <NavItem href="/alerts" label="Alerts" icon={Bell} />
            <NavItem href="/rules" label="Rules" icon={ShieldCheck} />
          </div>
        </div>

        {/* Configure */}
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Configure
          </p>
          <div className="space-y-0.5">
            <NavItem href="/settings" label="Settings" icon={Settings} />
          </div>
        </div>
      </nav>

      {/* Plan card pinned to bottom */}
      <div className="px-3 pb-4 pt-2">
        <PlanCard planName="Max Plan" monthlyCost={100} totalValue={totalValue} />
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Delete header.tsx (replaced by PageHeader in each page)**

Remove the file `packages/web/src/components/layout/header.tsx`:

```bash
rm packages/web/src/components/layout/header.tsx
```

The `PageHeader` component from Task 3 will be used inline in each page instead.

- [ ] **Step 3: Verify the app compiles**

```bash
cd packages/web && pnpm build
```

Expected: Build will fail because existing pages still import `Header`. This is expected — pages will be rewritten in the next tasks. To keep the build passing, create a temporary shim at the old header path:

Create `packages/web/src/components/layout/header.tsx`:

```tsx
'use client';

import { PageHeader } from '@/components/ui/page-header';

/** @deprecated — use PageHeader directly. This shim exists during the migration. */
export function Header({ connected }: { connected: boolean }) {
  return <PageHeader title="" connected={connected} />;
}
```

- [ ] **Step 4: Verify the app compiles with shim**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layout/sidebar.tsx packages/web/src/components/layout/header.tsx
git commit -m "feat(web): rewrite sidebar with sections, icons, plan card; add header shim"
```

---

## Task 7: Dashboard Page + Chart Components

**Files:**
- Create: `packages/web/src/components/live/token-flow-chart.tsx`
- Create: `packages/web/src/components/live/active-sessions.tsx`
- Rewrite: `packages/web/src/components/live/today-summary.tsx`
- Rewrite: `packages/web/src/app/page.tsx`

- [ ] **Step 1: Create token-flow-chart component**

Create `packages/web/src/components/live/token-flow-chart.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { chartColors, colors } from '@/lib/design-tokens';
import { formatTokens } from '@/lib/format';

interface TokenFlowDataPoint {
  time: string;
  inputTokens: number;
  outputTokens: number;
}

interface TokenFlowChartProps {
  data: TokenFlowDataPoint[];
}

type TimeRange = '24h' | '7d' | '30d';

export function TokenFlowChart({ data }: TokenFlowChartProps) {
  const [range, setRange] = useState<TimeRange>('24h');

  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-1)]">
          Token Flow
        </h3>
        <div className="flex gap-1 rounded-lg bg-[var(--surface-hover)] p-0.5">
          {(['24h', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                range === r
                  ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="inputGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.inputTokens} stopOpacity={0.2} />
              <stop offset="100%" stopColor={chartColors.inputTokens} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.outputTokens} stopOpacity={0.2} />
              <stop offset="100%" stopColor={chartColors.outputTokens} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="time"
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={{ stroke: chartColors.grid }}
            tickLine={false}
          />
          <YAxis
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatTokens(v)}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: `1px solid ${colors.border}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              formatTokens(value),
              name === 'inputTokens' ? 'Input' : 'Output',
            ]}
          />
          <Area
            type="monotone"
            dataKey="inputTokens"
            stroke={chartColors.inputTokens}
            strokeWidth={2}
            fill="url(#inputGradient)"
          />
          <Area
            type="monotone"
            dataKey="outputTokens"
            stroke={chartColors.outputTokens}
            strokeWidth={2}
            fill="url(#outputGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.inputTokens }} />
          <span className="text-[11px] text-[var(--text-2)]">Input</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.outputTokens }} />
          <span className="text-[11px] text-[var(--text-2)]">Output</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create active-sessions panel component**

Create `packages/web/src/components/live/active-sessions.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { StatusDot } from '@/components/ui/status-dot';
import { StatTag } from '@/components/ui/stat-tag';
import { formatTokens, formatCost, getBurnRateStatus } from '@/lib/format';

interface ActiveSession {
  sessionId: string;
  tool: string;
  sessionType: string;
  model: string;
  projectSlug: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
  durationMinutes?: number;
}

interface ActiveSessionsProps {
  sessions: ActiveSession[];
}

const statusVariant = {
  healthy: 'green' as const,
  warning: 'amber' as const,
  hot: 'red' as const,
};

export function ActiveSessions({ sessions }: ActiveSessionsProps) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">
          Active Sessions
        </h3>
        <p className="text-[13px] text-[var(--text-2)] py-8 text-center">
          No active sessions right now
        </p>
      </div>
    );
  }

  const sorted = [...sessions].sort((a, b) => b.cumulativeCostUsd - a.cumulativeCostUsd);

  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">
        Active Sessions
        <span className="ml-2 text-[var(--text-3)] font-normal">
          ({sessions.length})
        </span>
      </h3>
      <div className="space-y-2">
        {sorted.map((s) => {
          const status = getBurnRateStatus(s.burnRatePerMin);
          return (
            <Link
              key={s.sessionId}
              href={`/sessions/${s.sessionId}`}
              className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-[var(--surface-hover)]"
            >
              <StatusDot variant={statusVariant[status]} pulse />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[var(--text-1)] truncate">
                  {s.projectSlug}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <StatTag variant={s.sessionType === 'human' ? 'blue' : 'purple'}>
                    {s.sessionType}
                  </StatTag>
                  <span className="text-[10px] text-[var(--text-3)]">{s.model}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-bold font-mono text-[var(--text-1)]">
                  {formatCost(s.cumulativeCostUsd)}
                </p>
                <p className="text-[10px] text-[var(--text-3)] font-mono">
                  {formatTokens(s.burnRatePerMin)}/min
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite today-summary.tsx as 4 stat cards**

Replace the entire contents of `packages/web/src/components/live/today-summary.tsx`:

```tsx
import { StatCard } from '@/components/ui/stat-card';
import { StatTag } from '@/components/ui/stat-tag';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';
import { formatTokens, formatCost } from '@/lib/format';

interface TodaySummaryProps {
  totalCost: number;
  humanCost: number;
  agentCost: number;
  humanSessions: number;
  agentSessions: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
}

export function TodaySummary({
  totalCost,
  humanSessions,
  agentSessions,
  totalInputTokens,
  totalOutputTokens,
  totalCacheCreationTokens,
  totalCacheReadTokens,
}: TodaySummaryProps) {
  const totalSessions = humanSessions + agentSessions;
  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalCache = totalCacheReadTokens + totalCacheCreationTokens;
  const cacheEfficiency =
    totalTokens > 0
      ? Math.round((totalCacheReadTokens / (totalTokens + totalCache)) * 100)
      : 0;
  const valueRatio = totalCost > 0 ? Math.round(totalCost / 100) : 0;

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Sessions Today */}
      <StatCard label="Sessions Today" value={String(totalSessions)}>
        <div className="flex gap-1.5">
          <StatTag variant="blue">{humanSessions} human</StatTag>
          <StatTag variant="purple">{agentSessions} agent</StatTag>
        </div>
      </StatCard>

      {/* Tokens Generated */}
      <StatCard label="Tokens Generated" value={formatTokens(totalTokens)}>
        <div className="flex gap-1.5">
          <StatTag variant="blue">{formatTokens(totalInputTokens)} in</StatTag>
          <StatTag variant="purple">{formatTokens(totalOutputTokens)} out</StatTag>
        </div>
      </StatCard>

      {/* Cache Efficiency */}
      <StatCard label="Cache Efficiency" value={`${cacheEfficiency}%`}>
        <Progress value={cacheEfficiency} className="mt-1">
          <ProgressTrack className="h-1.5 bg-[var(--border)]">
            <ProgressIndicator className="bg-[var(--green)]" />
          </ProgressTrack>
        </Progress>
        <div className="flex gap-1.5 mt-1.5">
          <StatTag variant="green">
            {formatTokens(totalCacheReadTokens)} read
          </StatTag>
        </div>
      </StatCard>

      {/* API-Equivalent Value — dark inverted */}
      <StatCard
        label="API-Equivalent Value"
        value={formatCost(totalCost)}
        inverted
      >
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-white/50">$100/mo plan</span>
          <span className="font-mono font-bold text-[var(--green)]">
            {valueRatio}x ROI
          </span>
        </div>
      </StatCard>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite dashboard page (page.tsx)**

Replace the entire contents of `packages/web/src/app/page.tsx`:

```tsx
'use client';

import { useState, useCallback } from 'react';
import { Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { InsightCard } from '@/components/ui/insight-card';
import { TodaySummary } from '@/components/live/today-summary';
import { TokenFlowChart } from '@/components/live/token-flow-chart';
import { ActiveSessions } from '@/components/live/active-sessions';
import { SessionTable } from '@/components/sessions/session-table';
import { useLiveSummary, useSessionHistory } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';

interface LiveSession {
  sessionId: string;
  tool: string;
  sessionType: string;
  model: string;
  projectSlug: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
}

export default function DashboardHome() {
  const [activeSessions, setActiveSessions] = useState<Map<string, LiveSession>>(new Map());
  const [insightDismissed, setInsightDismissed] = useState(false);

  const handleMessage = useCallback((msg: { type: string; data: unknown }) => {
    if (msg.type === 'token_event') {
      const event = msg.data as LiveSession;
      setActiveSessions((prev) => new Map(prev).set(event.sessionId, event));
    } else if (msg.type === 'session_end') {
      const data = msg.data as { sessionId: string };
      setActiveSessions((prev) => {
        const next = new Map(prev);
        next.delete(data.sessionId);
        return next;
      });
    }
  }, []);

  const { connected } = useWebSocket(handleMessage);
  const { data: summary } = useLiveSummary();
  const { data: historyData } = useSessionHistory({ limit: '5' });

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  // Build mock token flow data from recent sessions (placeholder until API supports time-series)
  const tokenFlowData = (historyData?.sessions ?? []).map((s) => ({
    time: new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
  })).reverse();

  return (
    <div>
      <PageHeader
        title={greeting}
        subtitle={`${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${summary?.activeSessions ?? 0} active sessions`}
        connected={connected}
      />
      <div className="p-8 space-y-6">
        {/* Hero row: Token Flow chart + Active Sessions */}
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3">
            <TokenFlowChart data={tokenFlowData} />
          </div>
          <div className="col-span-2">
            <ActiveSessions sessions={Array.from(activeSessions.values())} />
          </div>
        </div>

        {/* Stats strip */}
        <TodaySummary
          totalCost={summary?.totalCostToday ?? 0}
          humanCost={summary?.humanCostToday ?? 0}
          agentCost={summary?.agentCostToday ?? 0}
          humanSessions={summary?.humanSessionsToday ?? 0}
          agentSessions={summary?.agentSessionsToday ?? 0}
          totalInputTokens={summary?.totalInputTokens ?? 0}
          totalOutputTokens={summary?.totalOutputTokens ?? 0}
          totalCacheCreationTokens={summary?.totalCacheCreationTokens ?? 0}
          totalCacheReadTokens={summary?.totalCacheReadTokens ?? 0}
        />

        {/* Insight card (static/mock for Sub-project 1) */}
        {!insightDismissed && (
          <InsightCard
            icon={Lightbulb}
            title="High cache hit rate detected"
            description="Your cache efficiency is above 60% today. Consider enabling prompt caching on long-running agent sessions to reduce costs further."
            actionLabel="Learn more"
            onAction={() => {}}
            onDismiss={() => setInsightDismissed(true)}
          />
        )}

        {/* Recent Sessions table */}
        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">
              Recent Sessions
            </h3>
            <Link
              href="/sessions"
              className="text-[12px] font-medium text-[var(--accent)] hover:underline"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="px-5 pb-5">
            <SessionTable sessions={historyData?.sessions ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify the app compiles**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds. The live/page.tsx still uses old TodaySummary props — the Live View page will be updated in Task 8.

Note: If build fails because `live/page.tsx` passes incorrect props to `TodaySummary`, temporarily update the call in `live/page.tsx` to pass all required props with 0 defaults:

```tsx
<TodaySummary
  totalCost={summary?.totalCostToday ?? 0}
  humanCost={summary?.humanCostToday ?? 0}
  agentCost={summary?.agentCostToday ?? 0}
  humanSessions={summary?.humanSessionsToday ?? 0}
  agentSessions={summary?.agentSessionsToday ?? 0}
  totalInputTokens={summary?.totalInputTokens ?? 0}
  totalOutputTokens={summary?.totalOutputTokens ?? 0}
  totalCacheCreationTokens={summary?.totalCacheCreationTokens ?? 0}
  totalCacheReadTokens={summary?.totalCacheReadTokens ?? 0}
/>
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/live/token-flow-chart.tsx packages/web/src/components/live/active-sessions.tsx packages/web/src/components/live/today-summary.tsx packages/web/src/app/page.tsx packages/web/src/app/live/page.tsx
git commit -m "feat(web): rewrite dashboard with Token Flow chart, Active Sessions panel, stat cards, and insight card"
```

---

## Task 8: Live View Page Rewrite

**Files:**
- Create: `packages/web/src/components/live/session-card.tsx`
- Create: `packages/web/src/components/live/token-stream.tsx`
- Rewrite: `packages/web/src/app/live/page.tsx`

- [ ] **Step 1: Create session-card component for live view grid**

Create `packages/web/src/components/live/session-card.tsx`:

```tsx
'use client';

import { RingGauge } from '@/components/ui/ring-gauge';
import { StatusDot } from '@/components/ui/status-dot';
import { StatTag } from '@/components/ui/stat-tag';
import { formatTokens, formatCost, formatDuration, getBurnRateStatus } from '@/lib/format';
import { colors } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';

interface SessionCardProps {
  sessionId: string;
  projectSlug: string;
  model: string;
  sessionType: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
  startedAt?: string;
}

const BASELINE_BURN_RATE = 1000;
const RING_MAX = 3000;

const borderColorMap = {
  healthy: 'border-[var(--green-border)]',
  warning: 'border-[var(--amber-border)]',
  hot: 'border-[var(--red-border)]',
};

const ringColorMap = {
  healthy: colors.green,
  warning: colors.amber,
  hot: colors.red,
};

export function SessionCard({
  projectSlug,
  model,
  sessionType,
  cumulativeInputTokens,
  cumulativeOutputTokens,
  cumulativeCostUsd,
  burnRatePerMin,
  startedAt,
}: SessionCardProps) {
  const status = getBurnRateStatus(burnRatePerMin, BASELINE_BURN_RATE);

  return (
    <div
      className={cn(
        'rounded-[20px] border-2 bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-colors',
        borderColorMap[status],
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <StatusDot variant={status === 'healthy' ? 'green' : status === 'warning' ? 'amber' : 'red'} pulse />
        <span className="text-[13px] font-semibold text-[var(--text-1)] truncate flex-1">
          {projectSlug}
        </span>
        <StatTag variant="neutral">{model}</StatTag>
      </div>

      <div className="flex items-center justify-center mb-4">
        <RingGauge
          value={burnRatePerMin}
          max={RING_MAX}
          size={90}
          strokeWidth={7}
          color={ringColorMap[status]}
        >
          <div className="text-center">
            <p className="text-sm font-bold font-mono text-[var(--text-1)]">
              {formatTokens(burnRatePerMin)}
            </p>
            <p className="text-[9px] text-[var(--text-3)]">tok/min</p>
          </div>
        </RingGauge>
      </div>

      <div className="space-y-2 text-[12px]">
        <div className="flex justify-between">
          <span className="text-[var(--text-2)]">Cost</span>
          <span className="font-mono font-semibold text-[var(--text-1)]">
            {formatCost(cumulativeCostUsd)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-2)]">Tokens</span>
          <span className="font-mono text-[var(--text-1)]">
            {formatTokens(cumulativeInputTokens + cumulativeOutputTokens)}
          </span>
        </div>
        {startedAt && (
          <div className="flex justify-between">
            <span className="text-[var(--text-2)]">Duration</span>
            <span className="font-mono text-[var(--text-1)]">
              {formatDuration(startedAt)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--border-light)]">
        <StatTag variant={sessionType === 'human' ? 'blue' : 'purple'}>
          {sessionType}
        </StatTag>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create token-stream component**

Create `packages/web/src/components/live/token-stream.tsx`:

```tsx
'use client';

import { useRef, useEffect } from 'react';
import { formatTokens, formatCost } from '@/lib/format';

interface TokenEvent {
  timestamp: string;
  projectSlug: string;
  inputTokensDelta: number;
  outputTokensDelta: number;
  costDelta: number;
  burnRatePerMin: number;
}

interface TokenStreamProps {
  events: TokenEvent[];
  maxEvents?: number;
}

export function TokenStream({ events, maxEvents = 50 }: TokenStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const visible = events.slice(0, maxEvents);

  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-5 py-3 border-b border-[var(--border-light)]">
        <h3 className="text-sm font-semibold text-[var(--text-1)]">
          Token Stream
        </h3>
      </div>
      <div ref={scrollRef} className="max-h-[300px] overflow-y-auto">
        {visible.length === 0 ? (
          <p className="text-[13px] text-[var(--text-2)] py-8 text-center">
            Waiting for token events...
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {visible.map((event, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-5 py-2 text-[12px] font-mono animate-[fade-in_0.2s_ease-out]"
              >
                <span className="text-[var(--text-3)] w-16 shrink-0">
                  {new Date(event.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="text-[var(--text-1)] font-medium truncate w-24">
                  {event.projectSlug}
                </span>
                <span className="text-[var(--blue)] w-16 text-right">
                  +{formatTokens(event.inputTokensDelta + event.outputTokensDelta)}
                </span>
                <span className="text-[var(--text-2)] w-16 text-right">
                  +{formatCost(event.costDelta)}
                </span>
                <span className="text-[var(--text-3)] w-20 text-right">
                  {formatTokens(event.burnRatePerMin)}/min
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite live view page**

Replace the entire contents of `packages/web/src/app/live/page.tsx`:

```tsx
'use client';

import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { SessionCard } from '@/components/live/session-card';
import { TokenStream } from '@/components/live/token-stream';
import { useWebSocket } from '@/hooks/use-websocket';
import { useLiveSummary } from '@/hooks/use-sessions';

interface LiveSession {
  sessionId: string;
  tool: string;
  sessionType: string;
  model: string;
  projectSlug: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
  startedAt?: string;
}

interface StreamEvent {
  timestamp: string;
  projectSlug: string;
  inputTokensDelta: number;
  outputTokensDelta: number;
  costDelta: number;
  burnRatePerMin: number;
}

export default function LivePage() {
  const [sessions, setSessions] = useState<Map<string, LiveSession>>(new Map());
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const { data: summary } = useLiveSummary();

  const handleMessage = useCallback((msg: { type: string; data: unknown }) => {
    if (msg.type === 'token_event') {
      const event = msg.data as LiveSession & {
        inputTokens?: number;
        outputTokens?: number;
        costUsd?: number;
      };
      setSessions((prev) => new Map(prev).set(event.sessionId, event));

      setStreamEvents((prev) => [
        {
          timestamp: new Date().toISOString(),
          projectSlug: event.projectSlug,
          inputTokensDelta: event.inputTokens ?? 0,
          outputTokensDelta: event.outputTokens ?? 0,
          costDelta: event.costUsd ?? 0,
          burnRatePerMin: event.burnRatePerMin,
        },
        ...prev,
      ].slice(0, 100));
    } else if (msg.type === 'session_end') {
      const data = msg.data as { sessionId: string };
      setSessions((prev) => {
        const next = new Map(prev);
        next.delete(data.sessionId);
        return next;
      });
    }
  }, []);

  const { connected } = useWebSocket(handleMessage);
  const sessionList = Array.from(sessions.values());

  return (
    <div>
      <PageHeader
        title="Live View"
        subtitle={`${sessionList.length} active session${sessionList.length !== 1 ? 's' : ''}`}
        connected={connected}
      />
      <div className="p-8 space-y-6">
        {/* Session cards grid */}
        {sessionList.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {sessionList.map((s) => (
              <SessionCard key={s.sessionId} {...s} />
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <p className="text-[13px] text-[var(--text-2)]">
              No active sessions. Start a Claude Code session to see live data.
            </p>
          </div>
        )}

        {/* Token stream */}
        <TokenStream events={streamEvents} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify the app compiles**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/live/session-card.tsx packages/web/src/components/live/token-stream.tsx packages/web/src/app/live/page.tsx
git commit -m "feat(web): rewrite Live View with session cards grid, ring gauges, and token stream"
```

---

## Task 9: Sessions Page + Session Detail Rewrite

**Files:**
- Create: `packages/web/src/components/sessions/session-filters.tsx`
- Create: `packages/web/src/components/sessions/cost-chart.tsx`
- Create: `packages/web/src/components/sessions/token-breakdown-chart.tsx`
- Rewrite: `packages/web/src/components/sessions/session-table.tsx`
- Rewrite: `packages/web/src/components/sessions/session-detail.tsx`
- Rewrite: `packages/web/src/app/sessions/page.tsx`
- Rewrite: `packages/web/src/app/sessions/[id]/page.tsx`

- [ ] **Step 1: Create session-filters component**

Create `packages/web/src/components/sessions/session-filters.tsx`:

```tsx
'use client';

interface SessionFiltersProps {
  sessionType: string;
  onSessionTypeChange: (value: string) => void;
  project: string;
  onProjectChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  timeRange: string;
  onTimeRangeChange: (value: string) => void;
  projects: string[];
  models: string[];
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-[var(--text-3)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-1)] outline-none focus:border-[var(--accent)] transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SessionFilters({
  sessionType,
  onSessionTypeChange,
  project,
  onProjectChange,
  model,
  onModelChange,
  timeRange,
  onTimeRangeChange,
  projects,
  models,
}: SessionFiltersProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <FilterPill
        label="Type"
        value={sessionType}
        onChange={onSessionTypeChange}
        options={[
          { value: 'all', label: 'All' },
          { value: 'human', label: 'Human' },
          { value: 'agent', label: 'Agent' },
        ]}
      />
      <FilterPill
        label="Project"
        value={project}
        onChange={onProjectChange}
        options={[
          { value: 'all', label: 'All Projects' },
          ...projects.map((p) => ({ value: p, label: p })),
        ]}
      />
      <FilterPill
        label="Model"
        value={model}
        onChange={onModelChange}
        options={[
          { value: 'all', label: 'All Models' },
          ...models.map((m) => ({ value: m, label: m })),
        ]}
      />
      <FilterPill
        label="Period"
        value={timeRange}
        onChange={onTimeRangeChange}
        options={[
          { value: '24h', label: '24h' },
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite session-table with sparklines and badges**

Replace the entire contents of `packages/web/src/components/sessions/session-table.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { StatTag } from '@/components/ui/stat-tag';
import { Sparkline } from '@/components/ui/sparkline';
import { formatTokens, formatCost, formatDuration } from '@/lib/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Session {
  id: string;
  tool: string;
  projectSlug: string;
  sessionType: string;
  model: string;
  startedAt: string;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface SessionTableProps {
  sessions: Session[];
}

export function SessionTable({ sessions }: SessionTableProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-center text-[var(--text-2)] py-12 text-[13px]">
        No sessions recorded yet. Start using Claude Code with the Pulse agent running.
      </p>
    );
  }

  // Generate sparkline data from token distribution per session
  const maxTokens = Math.max(...sessions.map((s) => s.inputTokens + s.outputTokens), 1);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => {
          const totalTokens = session.inputTokens + session.outputTokens;
          const duration = formatDuration(session.startedAt, session.endedAt);
          const isAnomaly = session.costUsd > 50;

          // Simple sparkline: [input, output] as 2-bar chart
          const sparkData = [session.inputTokens, session.outputTokens];

          return (
            <TableRow key={session.id} className="group cursor-pointer">
              <TableCell>
                <Link
                  href={`/sessions/${session.id}`}
                  className="text-[13px] font-semibold text-[var(--text-1)] hover:text-[var(--accent)]"
                >
                  {session.projectSlug}
                </Link>
              </TableCell>
              <TableCell>
                <StatTag variant={session.sessionType === 'human' ? 'blue' : 'purple'}>
                  {session.sessionType}
                </StatTag>
              </TableCell>
              <TableCell className="text-[12px] text-[var(--text-2)]">
                {session.model}
              </TableCell>
              <TableCell className="text-[12px] text-[var(--text-2)]">
                {duration}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Sparkline data={sparkData} height={14} />
                  <span className="text-[12px] font-mono text-[var(--text-1)]">
                    {formatTokens(totalTokens)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={`text-[12px] font-mono font-semibold ${
                    isAnomaly ? 'text-[var(--red)]' : 'text-[var(--text-1)]'
                  }`}
                >
                  {formatCost(session.costUsd)}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Create cost-chart component**

Create `packages/web/src/components/sessions/cost-chart.tsx`:

```tsx
'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { chartColors, colors } from '@/lib/design-tokens';
import { formatCost } from '@/lib/format';

interface CostChartProps {
  data: Array<{
    time: string;
    cost: number;
    burnRate: number;
  }>;
}

export function CostChart({ data }: CostChartProps) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
        Cost Over Time
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="time"
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={{ stroke: chartColors.grid }}
            tickLine={false}
          />
          <YAxis
            yAxisId="cost"
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatCost(v)}
          />
          <YAxis
            yAxisId="burnRate"
            orientation="right"
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: `1px solid ${colors.border}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              name === 'cost' ? formatCost(value) : `${value.toFixed(0)} tok/min`,
              name === 'cost' ? 'Cumulative Cost' : 'Burn Rate',
            ]}
          />
          <Line
            yAxisId="cost"
            type="monotone"
            dataKey="cost"
            stroke={chartColors.cost}
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="burnRate"
            type="monotone"
            dataKey="burnRate"
            stroke={chartColors.burnRate}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ background: chartColors.cost }} />
          <span className="text-[11px] text-[var(--text-2)]">Cost</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full border-b border-dashed" style={{ borderColor: chartColors.burnRate }} />
          <span className="text-[11px] text-[var(--text-2)]">Burn Rate</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create token-breakdown-chart component**

Create `packages/web/src/components/sessions/token-breakdown-chart.tsx`:

```tsx
'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { chartColors, colors } from '@/lib/design-tokens';
import { formatTokens } from '@/lib/format';

interface TokenBreakdownChartProps {
  data: Array<{
    time: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  }>;
}

export function TokenBreakdownChart({ data }: TokenBreakdownChartProps) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
        Token Breakdown
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.inputTokens} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.inputTokens} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.outputTokens} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.outputTokens} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cacheReadGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.cacheRead} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.cacheRead} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cacheCreateGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.cacheCreation} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.cacheCreation} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="time"
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={{ stroke: chartColors.grid }}
            tickLine={false}
          />
          <YAxis
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatTokens(v)}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: `1px solid ${colors.border}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: 12,
            }}
            formatter={(value: number) => [formatTokens(value)]}
          />
          <Area type="monotone" dataKey="inputTokens" stackId="1" stroke={chartColors.inputTokens} strokeWidth={1.5} fill="url(#inputGrad)" />
          <Area type="monotone" dataKey="outputTokens" stackId="1" stroke={chartColors.outputTokens} strokeWidth={1.5} fill="url(#outputGrad)" />
          <Area type="monotone" dataKey="cacheReadTokens" stackId="1" stroke={chartColors.cacheRead} strokeWidth={1.5} fill="url(#cacheReadGrad)" />
          <Area type="monotone" dataKey="cacheCreationTokens" stackId="1" stroke={chartColors.cacheCreation} strokeWidth={1.5} fill="url(#cacheCreateGrad)" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 px-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.inputTokens }} />
          <span className="text-[11px] text-[var(--text-2)]">Input</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.outputTokens }} />
          <span className="text-[11px] text-[var(--text-2)]">Output</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.cacheRead }} />
          <span className="text-[11px] text-[var(--text-2)]">Cache Read</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.cacheCreation }} />
          <span className="text-[11px] text-[var(--text-2)]">Cache Creation</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite session-detail component**

Replace the entire contents of `packages/web/src/components/sessions/session-detail.tsx`:

```tsx
'use client';

import { StatCard } from '@/components/ui/stat-card';
import { StatTag } from '@/components/ui/stat-tag';
import { CostChart } from './cost-chart';
import { TokenBreakdownChart } from './token-breakdown-chart';
import { formatTokens, formatCost, formatDuration } from '@/lib/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TokenEvent {
  timestamp: string;
  cumulativeCostUsd: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  burnRatePerMin: number;
}

interface SessionDetailProps {
  session: {
    id: string;
    tool: string;
    projectSlug: string;
    sessionType: string;
    model: string;
    startedAt: string;
    endedAt: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    tokenEvents: TokenEvent[];
  };
}

export function SessionDetail({ session }: SessionDetailProps) {
  const duration = formatDuration(session.startedAt, session.endedAt);
  const totalTokens = session.inputTokens + session.outputTokens;

  const costChartData = session.tokenEvents.map((e) => ({
    time: new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cost: e.cumulativeCostUsd,
    burnRate: e.burnRatePerMin,
  }));

  // Token breakdown: show cumulative tokens at each event
  const tokenBreakdownData = session.tokenEvents.map((e) => ({
    time: new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    inputTokens: e.cumulativeInputTokens,
    outputTokens: e.cumulativeOutputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }));

  return (
    <div className="space-y-6">
      {/* Session header */}
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-[var(--text-1)]">
          {session.projectSlug}
        </h2>
        <StatTag variant={session.sessionType === 'human' ? 'blue' : 'purple'}>
          {session.sessionType}
        </StatTag>
        <StatTag variant="neutral">{session.model}</StatTag>
        <span className="text-[12px] text-[var(--text-2)]">
          Started {new Date(session.startedAt).toLocaleString()}
        </span>
        <StatTag variant={session.endedAt ? 'neutral' : 'green'}>
          {session.endedAt ? 'Ended' : 'Active'}
        </StatTag>
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Duration" value={duration} />
        <StatCard label="Total Tokens" value={formatTokens(totalTokens)}>
          <div className="flex gap-1.5">
            <StatTag variant="blue">{formatTokens(session.inputTokens)} in</StatTag>
            <StatTag variant="purple">{formatTokens(session.outputTokens)} out</StatTag>
          </div>
        </StatCard>
        <StatCard label="Total Value" value={formatCost(session.costUsd)} inverted />
      </div>

      {/* Charts */}
      {costChartData.length > 1 && (
        <div className="grid grid-cols-2 gap-6">
          <CostChart data={costChartData} />
          <TokenBreakdownChart data={tokenBreakdownData} />
        </div>
      )}

      {/* Token events table */}
      {session.tokenEvents.length > 0 && (
        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="px-5 py-3 border-b border-[var(--border-light)]">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">
              Token Events
            </h3>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Burn Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.tokenEvents.map((event, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-[12px] font-mono text-[var(--text-2)]">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono">
                      {formatTokens(event.cumulativeInputTokens)}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono">
                      {formatTokens(event.cumulativeOutputTokens)}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono">
                      {formatCost(event.cumulativeCostUsd)}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono">
                      {formatTokens(event.burnRatePerMin)}/min
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Rewrite sessions page**

Replace the entire contents of `packages/web/src/app/sessions/page.tsx`:

```tsx
'use client';

import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { SessionTable } from '@/components/sessions/session-table';
import { SessionFilters } from '@/components/sessions/session-filters';
import { useSessionHistory } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';

export default function SessionsPage() {
  const [page, setPage] = useState(1);
  const [sessionType, setSessionType] = useState('all');
  const [project, setProject] = useState('all');
  const [model, setModel] = useState('all');
  const [timeRange, setTimeRange] = useState('24h');

  const { connected } = useWebSocket(() => {});
  const { data } = useSessionHistory({ page: String(page), limit: '20' });

  // Extract unique projects and models for filter dropdowns
  const projects = useMemo(() => {
    if (!data?.sessions) return [];
    return [...new Set(data.sessions.map((s) => s.projectSlug))];
  }, [data]);

  const models = useMemo(() => {
    if (!data?.sessions) return [];
    return [...new Set(data.sessions.map((s) => s.model))];
  }, [data]);

  // Client-side filtering (API doesn't support filters yet)
  const filteredSessions = useMemo(() => {
    if (!data?.sessions) return [];
    return data.sessions.filter((s) => {
      if (sessionType !== 'all' && s.sessionType !== sessionType) return false;
      if (project !== 'all' && s.projectSlug !== project) return false;
      if (model !== 'all' && s.model !== model) return false;
      return true;
    });
  }, [data, sessionType, project, model]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div>
      <PageHeader
        title="Sessions"
        subtitle={`${data?.total ?? 0} total sessions`}
        connected={connected}
      />
      <div className="p-8 space-y-6">
        <SessionFilters
          sessionType={sessionType}
          onSessionTypeChange={setSessionType}
          project={project}
          onProjectChange={setProject}
          model={model}
          onModelChange={setModel}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          projects={projects}
          models={models}
        />

        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <SessionTable sessions={filteredSessions} />
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-[9px] border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-[12px] text-[var(--text-2)] px-2">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="rounded-[9px] border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Rewrite session detail page**

Replace the entire contents of `packages/web/src/app/sessions/[id]/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SessionDetail } from '@/components/sessions/session-detail';
import { useSessionDetail } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { connected } = useWebSocket(() => {});
  const { data: session, isLoading } = useSessionDetail(id);

  return (
    <div>
      <PageHeader title="Session Detail" connected={connected}>
        <Link
          href="/sessions"
          className="flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          <ArrowLeft size={14} />
          Back to Sessions
        </Link>
      </PageHeader>
      <div className="p-8">
        {isLoading && (
          <p className="text-[13px] text-[var(--text-2)] text-center py-12">
            Loading session...
          </p>
        )}
        {session && <SessionDetail session={session} />}
        {!isLoading && !session && (
          <p className="text-[13px] text-[var(--text-2)] text-center py-12">
            Session not found.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Verify the app compiles**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/components/sessions/ packages/web/src/app/sessions/
git commit -m "feat(web): rewrite Sessions pages with filters, sparklines, cost chart, token breakdown"
```

---

## Task 10: Placeholder Pages + Settings Rewrite

**Files:**
- Create: `packages/web/src/app/insights/page.tsx`
- Create: `packages/web/src/app/alerts/page.tsx`
- Create: `packages/web/src/app/rules/page.tsx`
- Rewrite: `packages/web/src/app/settings/page.tsx`

- [ ] **Step 1: Create insights placeholder page**

Create `packages/web/src/app/insights/page.tsx`:

```tsx
'use client';

import { Lightbulb } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoon } from '@/components/ui/coming-soon';
import { useWebSocket } from '@/hooks/use-websocket';

export default function InsightsPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <PageHeader title="Insights" connected={connected} />
      <ComingSoon
        icon={Lightbulb}
        title="Intelligence features are coming"
        description="Insights will analyze your usage patterns and provide actionable recommendations to optimize costs, improve cache efficiency, and detect anomalies across your AI tool sessions."
        previewCards={[
          {
            title: 'Cache optimization opportunity',
            description: 'Enable prompt caching on 3 projects to save ~$45/mo in API-equivalent costs.',
          },
          {
            title: 'Unusual burn rate detected',
            description: 'Project "api-refactor" consumed 3x its average tokens yesterday. Review for runaway loops.',
          },
          {
            title: 'Agent session efficiency',
            description: 'Agent sessions average 2.1x more tokens than human sessions for similar tasks.',
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create alerts placeholder page**

Create `packages/web/src/app/alerts/page.tsx`:

```tsx
'use client';

import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoon } from '@/components/ui/coming-soon';
import { useWebSocket } from '@/hooks/use-websocket';

export default function AlertsPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <PageHeader title="Alerts" connected={connected} />
      <ComingSoon
        icon={Bell}
        title="Alerts are coming"
        description="Get notified when sessions exceed cost thresholds, burn rates spike, or anomalies are detected. Configure delivery via email, Slack, or in-app notifications."
        previewCards={[
          {
            title: 'Cost threshold exceeded',
            description: 'Alert when any single session exceeds $50 in API-equivalent value.',
          },
          {
            title: 'Burn rate spike',
            description: 'Alert when burn rate exceeds 3x the project average for more than 5 minutes.',
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create rules placeholder page**

Create `packages/web/src/app/rules/page.tsx`:

```tsx
'use client';

import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoon } from '@/components/ui/coming-soon';
import { useWebSocket } from '@/hooks/use-websocket';

export default function RulesPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <PageHeader title="Rules" connected={connected} />
      <ComingSoon
        icon={ShieldCheck}
        title="Governance rules are coming"
        description="Define and enforce usage policies across your team. Set cost limits, restrict models, require cache usage, and automatically enforce recommendations from the Insights page."
        previewCards={[
          {
            title: 'Daily cost cap',
            description: 'Enforce a maximum daily API-equivalent cost per developer or project.',
          },
          {
            title: 'Model restrictions',
            description: 'Restrict agent sessions to Sonnet-class models to control costs.',
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 4: Rewrite settings page**

Replace the entire contents of `packages/web/src/app/settings/page.tsx`:

```tsx
'use client';

import { PageHeader } from '@/components/ui/page-header';
import { StatusDot } from '@/components/ui/status-dot';
import { StatTag } from '@/components/ui/stat-tag';
import { useWebSocket } from '@/hooks/use-websocket';
import { useLiveSummary } from '@/hooks/use-sessions';
import { formatCost } from '@/lib/format';

export default function SettingsPage() {
  const { connected } = useWebSocket(() => {});
  const { data: summary } = useLiveSummary();
  const totalValue = summary?.totalCostToday ?? 0;
  const valueRatio = totalValue > 0 ? Math.round(totalValue / 100) : 0;

  return (
    <div>
      <PageHeader title="Settings" connected={connected} />
      <div className="p-8 space-y-6 max-w-2xl">
        {/* Plan Section */}
        <Section title="Plan">
          <Row label="Plan" value={<StatTag variant="green">Max Plan</StatTag>} />
          <Row label="Monthly Cost" value="$100/mo" />
          <Row
            label="Value Ratio"
            value={
              <span className="font-mono font-bold text-[var(--green)]">
                {valueRatio}x
              </span>
            }
          />
          <Row
            label="Today's Value"
            value={
              <span className="font-mono">{formatCost(totalValue)}</span>
            }
          />
        </Section>

        {/* Agent Section */}
        <Section title="Agent">
          <Row
            label="Connection Status"
            value={
              <div className="flex items-center gap-2">
                <StatusDot variant={connected ? 'green' : 'red'} pulse={connected} />
                <span className="text-[13px]">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            }
          />
          <Row
            label="API Endpoint"
            value={
              <code className="text-[12px] bg-[var(--surface-hover)] px-2 py-0.5 rounded-md font-mono">
                {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
              </code>
            }
          />
          <Row
            label="WebSocket"
            value={
              <code className="text-[12px] bg-[var(--surface-hover)] px-2 py-0.5 rounded-md font-mono">
                {process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws'}
              </code>
            }
          />
        </Section>

        {/* Display Section */}
        <Section title="Display">
          <Row label="Timezone" value="Browser default" />
          <Row label="Token Format" value="Abbreviated (k / M / B)" />
          <Row label="Currency" value="USD ($)" />
        </Section>

        {/* Notifications Section */}
        <Section title="Notifications">
          <p className="text-[13px] text-[var(--text-2)] py-2">
            Configure alerts and notifications in the{' '}
            <a href="/alerts" className="text-[var(--accent)] hover:underline">
              Alerts page
            </a>{' '}
            (coming soon).
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-5 py-3 border-b border-[var(--border-light)]">
        <h3 className="text-sm font-semibold text-[var(--text-1)]">{title}</h3>
      </div>
      <div className="px-5 py-3 space-y-3">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[13px] text-[var(--text-2)]">{label}</span>
      <div className="text-[13px] text-[var(--text-1)]">{value}</div>
    </div>
  );
}
```

- [ ] **Step 5: Verify the app compiles**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/app/insights/ packages/web/src/app/alerts/ packages/web/src/app/rules/ packages/web/src/app/settings/page.tsx
git commit -m "feat(web): add Insights/Alerts/Rules placeholder pages; rewrite Settings with plan/agent/display sections"
```

---

## Task 11: Cleanup — Remove Old Components + Final Verification

**Files:**
- Delete: `packages/web/src/components/live/token-gauge.tsx`
- Delete: `packages/web/src/components/live/burn-rate.tsx`
- Delete: `packages/web/src/components/live/cost-meter.tsx`
- Delete: `packages/web/src/components/live/active-session-panel.tsx`
- Delete: `packages/web/src/components/layout/header.tsx` (the shim)

- [ ] **Step 1: Delete unused components**

```bash
rm packages/web/src/components/live/token-gauge.tsx
rm packages/web/src/components/live/burn-rate.tsx
rm packages/web/src/components/live/cost-meter.tsx
rm packages/web/src/components/live/active-session-panel.tsx
rm packages/web/src/components/layout/header.tsx
```

- [ ] **Step 2: Verify no remaining imports of deleted files**

Search for any remaining imports:

```bash
cd packages/web && grep -r "token-gauge\|burn-rate\|cost-meter\|active-session-panel\|layout/header" src/ --include="*.tsx" --include="*.ts"
```

Expected: No results. If any imports remain, update those files to remove the imports.

- [ ] **Step 3: Run full build**

```bash
cd packages/web && pnpm build
```

Expected: Build succeeds with zero errors.

- [ ] **Step 4: Run tests**

```bash
cd packages/web && pnpm test
```

Expected: All formatting utility tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A packages/web/
git commit -m "chore(web): remove old components replaced by design system overhaul"
```

- [ ] **Step 6: Run the dev server and manually verify**

```bash
cd packages/web && pnpm dev
```

Open `http://localhost:3000` in a browser. Verify:
- Sidebar shows 3 sections (Monitor, Intelligence, Configure) with the dark plan card at the bottom
- Dashboard shows greeting, Token Flow chart, Active Sessions panel, 4 stat cards, insight card, recent sessions table
- Navigate to `/live` — shows empty state or session cards if agent is running
- Navigate to `/sessions` — shows filters bar + session table with sparklines
- Navigate to `/insights`, `/alerts`, `/rules` — shows coming soon pages with preview cards
- Navigate to `/settings` — shows plan, agent, display, notifications sections
- All pages use the warm, light design with orange-coral accents
