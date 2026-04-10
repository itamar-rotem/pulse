'use client';

import { useState } from 'react';
import { Plus, Trash2, Copy, Check } from 'lucide-react';
import useSWR from 'swr';
import { PageHeader } from '@/components/ui/page-header';
import { useWebSocket } from '@/hooks/use-websocket';
import { fetchApi } from '@/lib/api';

interface ApiKey {
  id: string;
  prefix: string;
  name: string;
  createdBy: { email: string; name: string | null } | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreateKeyResponse {
  id: string;
  key: string;
  prefix: string;
  name: string;
  createdAt: string;
}

export default function ApiKeysPage() {
  const { connected } = useWebSocket(() => {});
  const { data: keys, mutate } = useSWR<ApiKey[]>(
    '/api/api-keys',
    (url: string) => fetchApi<ApiKey[]>(url),
  );
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!keyName) return;
    setSubmitting(true);
    try {
      const result = await fetchApi<CreateKeyResponse>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: keyName }),
      });
      setNewKey(result.key);
      setKeyName('');
      setShowCreate(false);
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    await fetchApi(`/api/api-keys/${id}`, { method: 'DELETE' });
    await mutate();
  }

  function handleCopy() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div>
      <PageHeader title="API Keys" connected={connected} />
      <div className="p-8 max-w-2xl space-y-4">
        {newKey && (
          <div className="rounded-[12px] border border-[var(--green)] bg-[var(--green-bg)] p-4">
            <p className="text-[13px] font-semibold text-[var(--green)] mb-2">
              Key created — copy it now, it won&apos;t be shown again
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[12px] font-mono bg-[var(--bg)] px-3 py-2 rounded-[8px] truncate">
                {newKey}
              </code>
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-[var(--surface-hover)]"
                aria-label="Copy API key"
              >
                {copied ? (
                  <Check size={14} className="text-[var(--green)]" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">API Keys</h3>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]"
            >
              <Plus size={13} /> Create Key
            </button>
          </div>

          <div className="px-5 py-3 space-y-3">
            {showCreate && (
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
                <input
                  className="flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Key name (e.g. Production Agent)"
                />
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setKeyName('');
                  }}
                  className="text-[12px] text-[var(--text-3)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!keyName || submitting}
                  className="rounded-[8px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            )}

            {keys?.map((key) => (
              <div key={key.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-[13px] font-medium text-[var(--text-1)]">
                    {key.name}
                  </div>
                  <div className="text-[12px] text-[var(--text-3)] font-mono">
                    {key.prefix}...
                  </div>
                  {key.createdBy && (
                    <div className="text-[11px] text-[var(--text-3)]">
                      Created by {key.createdBy.name ?? key.createdBy.email}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[var(--text-3)]">
                    {key.lastUsedAt
                      ? `Used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : 'Never used'}
                  </span>
                  <button
                    onClick={() => handleRevoke(key.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--red-bg)] text-[var(--text-3)] hover:text-[var(--red)]"
                    aria-label={`Revoke ${key.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            {(!keys || keys.length === 0) && !showCreate && (
              <p className="text-[13px] text-[var(--text-3)] py-2">
                No API keys created yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
