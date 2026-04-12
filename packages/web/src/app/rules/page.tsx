'use client';

import { useState } from 'react';
import { ShieldCheck, Plus, Trash2, Clock } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatTag } from '@/components/ui/stat-tag';
import { useWebSocket } from '@/hooks/use-websocket';
import { useRules, toggleRule, createRule, deleteRule } from '@/hooks/use-intelligence';
import { useProjects } from '@/hooks/use-projects';
import { formatRelativeTime } from '@/lib/format';
import type { RuleType, RuleAction, Rule } from '@pulse/shared';

const RULE_TYPE_LABEL: Record<RuleType, string> = {
  COST_CAP_SESSION: 'Session Cost Cap',
  COST_CAP_DAILY: 'Daily Cost Cap',
  COST_CAP_PROJECT: 'Project Cost Cap',
  MODEL_RESTRICTION: 'Model Restriction',
  BURN_RATE_LIMIT: 'Burn Rate Limit',
  SESSION_DURATION: 'Session Duration',
};

const ACTION_VARIANT: Record<RuleAction, 'blue' | 'amber' | 'red'> = {
  ALERT: 'blue',
  PAUSE: 'amber',
  BLOCK: 'red',
};

export default function RulesPage() {
  const { connected } = useWebSocket(() => {});
  const { data: rules, mutate } = useRules();
  const { data: projectsData } = useProjects({ status: 'active' });
  const projects = projectsData?.projects ?? [];
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<RuleType>('COST_CAP_SESSION');
  const [formAction, setFormAction] = useState<RuleAction>('ALERT');
  const [formGlobal, setFormGlobal] = useState(true);
  const [formProject, setFormProject] = useState('');
  const [formMaxCost, setFormMaxCost] = useState('50');
  const [formMaxRate, setFormMaxRate] = useState('10000');
  const [formMaxMinutes, setFormMaxMinutes] = useState('120');
  const [formAllowedModels, setFormAllowedModels] = useState('claude-sonnet-4-6');
  const [formPeriod, setFormPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  async function handleToggle(id: string) {
    await toggleRule(id);
    mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this rule?')) return;
    await deleteRule(id);
    mutate();
  }

  async function handleCreate() {
    const scope = formGlobal ? { global: true } : { projectId: formProject };

    let condition: Record<string, unknown> = {};
    if (formType === 'COST_CAP_SESSION' || formType === 'COST_CAP_DAILY') {
      condition = { maxCost: parseFloat(formMaxCost) };
    } else if (formType === 'COST_CAP_PROJECT') {
      condition = { maxCost: parseFloat(formMaxCost), period: formPeriod };
    } else if (formType === 'MODEL_RESTRICTION') {
      condition = { allowedModels: formAllowedModels.split(',').map((m) => m.trim()) };
    } else if (formType === 'BURN_RATE_LIMIT') {
      condition = { maxRate: parseInt(formMaxRate) };
    } else if (formType === 'SESSION_DURATION') {
      condition = { maxMinutes: parseInt(formMaxMinutes) };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createRule({ name: formName, type: formType, scope, condition, action: formAction } as Record<string, unknown> as any);
    setShowCreate(false);
    setFormName('');
    mutate();
  }

  function scopeDescription(rule: Rule): string {
    const scope = rule.scope as Record<string, unknown>;
    if (scope.global) return 'Global';
    if (scope.projectId) {
      const project = projects.find((p) => p.id === scope.projectId);
      return `Project: ${project?.name ?? project?.slug ?? (scope.projectId as string)}`;
    }
    if (scope.sessionType) return `Type: ${scope.sessionType}`;
    return 'Unknown scope';
  }

  function conditionDescription(rule: Rule): string {
    const cond = rule.condition as Record<string, unknown>;
    if (cond.maxCost) return `$${cond.maxCost}${cond.period ? ` / ${cond.period}` : ''}`;
    if (cond.allowedModels) return `Models: ${(cond.allowedModels as string[]).join(', ')}`;
    if (cond.maxRate) return `${cond.maxRate} tok/min`;
    if (cond.maxMinutes) return `${cond.maxMinutes} min`;
    return '';
  }

  return (
    <div>
      <PageHeader title="Rules" subtitle="Governance rules for cost caps, model restrictions, and session limits" connected={connected}>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(255,107,53,0.25)]"
        >
          <Plus size={14} /> Create Rule
        </button>
      </PageHeader>

      <div className="px-8 py-6 max-w-5xl">
        {/* Create modal */}
        {showCreate && (
          <div className="rounded-[16px] border border-[var(--accent)] border-opacity-30 bg-[var(--surface)] p-5 space-y-4 mb-6">
            <h3 className="text-[15px] font-bold text-[var(--text-1)]">New Rule</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Name</label>
                <input className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Daily cost cap" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Type</label>
                <select className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formType} onChange={(e) => setFormType(e.target.value as RuleType)}>
                  {Object.entries(RULE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Action</label>
                <select className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formAction} onChange={(e) => setFormAction(e.target.value as RuleAction)}>
                  <option value="ALERT">Alert Only</option>
                  <option value="PAUSE">Pause Session</option>
                  <option value="BLOCK">Block (Flag)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Scope</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[13px]">
                    <input type="checkbox" checked={formGlobal} onChange={(e) => setFormGlobal(e.target.checked)} /> Global
                  </label>
                  {!formGlobal && (
                    <select
                      className="flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                      value={formProject}
                      onChange={(e) => setFormProject(e.target.value)}
                    >
                      <option value="">Select project…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.slug})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Condition fields (dynamic by type) */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Condition</label>
              {(formType === 'COST_CAP_SESSION' || formType === 'COST_CAP_DAILY') && (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[var(--text-2)]">Max cost $</span>
                  <input className="w-24 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" type="number" value={formMaxCost} onChange={(e) => setFormMaxCost(e.target.value)} />
                </div>
              )}
              {formType === 'COST_CAP_PROJECT' && (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[var(--text-2)]">Max cost $</span>
                  <input className="w-24 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" type="number" value={formMaxCost} onChange={(e) => setFormMaxCost(e.target.value)} />
                  <span className="text-[13px] text-[var(--text-2)]">per</span>
                  <select className="rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formPeriod} onChange={(e) => setFormPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')}>
                    <option value="daily">Day</option>
                    <option value="weekly">Week</option>
                    <option value="monthly">Month</option>
                  </select>
                </div>
              )}
              {formType === 'MODEL_RESTRICTION' && (
                <input className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formAllowedModels} onChange={(e) => setFormAllowedModels(e.target.value)} placeholder="claude-sonnet-4-6, claude-haiku-4-5" />
              )}
              {formType === 'BURN_RATE_LIMIT' && (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[var(--text-2)]">Max rate</span>
                  <input className="w-28 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" type="number" value={formMaxRate} onChange={(e) => setFormMaxRate(e.target.value)} />
                  <span className="text-[13px] text-[var(--text-2)]">tok/min</span>
                </div>
              )}
              {formType === 'SESSION_DURATION' && (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[var(--text-2)]">Max duration</span>
                  <input className="w-24 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" type="number" value={formMaxMinutes} onChange={(e) => setFormMaxMinutes(e.target.value)} />
                  <span className="text-[13px] text-[var(--text-2)]">minutes</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded-[8px] border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-2)]">Cancel</button>
              <button onClick={handleCreate} disabled={!formName || (!formGlobal && !formProject)} className="rounded-[8px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Create</button>
            </div>
          </div>
        )}

        {/* Rule cards */}
        <div className="space-y-2">
          {(!rules || rules.length === 0) && !showCreate && (
            <div className="text-center py-16 text-[var(--text-3)]">
              <ShieldCheck size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-[15px] font-medium">No rules configured</p>
              <p className="text-[13px] mt-1">Create rules to set cost caps, model restrictions, and session limits</p>
            </div>
          )}

          {rules?.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-[16px] border bg-[var(--surface)] p-4 ${
                rule.enabled ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(rule.id)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    rule.enabled ? 'bg-[var(--green)]' : 'bg-[var(--border)]'
                  }`}
                >
                  <div className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                    rule.enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--text-1)]">{rule.name}</span>
                    <StatTag variant="neutral">{RULE_TYPE_LABEL[rule.type]}</StatTag>
                    <StatTag variant={ACTION_VARIANT[rule.action]}>{rule.action}</StatTag>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[12px] text-[var(--text-3)]">
                    <span>{scopeDescription(rule)}</span>
                    <span className="text-[var(--border)]">|</span>
                    <span>{conditionDescription(rule)}</span>
                    {rule.triggerCount > 0 && (
                      <>
                        <span className="text-[var(--border)]">|</span>
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          Triggered {rule.triggerCount}x
                          {rule.lastTriggeredAt && ` · ${formatRelativeTime(rule.lastTriggeredAt)}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-1.5 rounded-lg hover:bg-[var(--red-bg)] text-[var(--text-3)] hover:text-[var(--red)]"
                  title="Delete rule"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
