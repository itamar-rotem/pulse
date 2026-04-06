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
