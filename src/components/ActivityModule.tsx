import React, { useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import type { ActivityLogItem } from '../types/poms';
import { EmptyState, Input, Select, Skeleton } from './ui/primitives';

export function ActivityModule() {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [search, setSearch] = useState('');

  const loadLogs = async (typeFilter = entityType) => {
    setLoading(true);
    try {
      const qs = typeFilter ? `?entityType=${encodeURIComponent(typeFilter)}` : '';
      const res = await apiFetch<{ logs: ActivityLogItem[] }>(`/api/activity-logs${qs}`);
      setLogs(res.logs);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load activity history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(entityType);
  }, [entityType]);

  const filtered = logs.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      l.summary.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.entityType.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Activity History</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automatic audit log of tasks, projects, notes, records, financial entries, documents, and security events.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity log..."
            className="pl-9"
          />
        </div>
        <Select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="w-auto min-w-[160px]"
        >
          <option value="">All Activity Types</option>
          <option value="task">Tasks</option>
          <option value="project">Projects</option>
          <option value="note">Notes</option>
          <option value="event">Planner &amp; Calendar</option>
          <option value="record">Data Manager</option>
          <option value="transaction">Finance</option>
          <option value="file">File Manager</option>
          <option value="system">System &amp; Security</option>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title="No activity recorded yet"
          description="Actions performed across your office modules will automatically appear here with timestamps."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.summary}</p>
                <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                  {item.entityType} · {item.action.replace('_', ' ')}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatDateTime(item.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
