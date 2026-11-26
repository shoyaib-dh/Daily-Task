import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  FolderKanban,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  priorityTextClass,
} from '../lib/utils';
import type { AdminProfile, DashboardSummary, ModuleKey } from '../types/poms';
import { Button, Skeleton } from './ui/primitives';

interface DashboardModuleProps {
  admin: AdminProfile;
  onNavigate: (module: ModuleKey) => void;
}

export function DashboardModule({ admin, onNavigate }: DashboardModuleProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<DashboardSummary>('/api/dashboard/summary');
      setSummary(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const currentDateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const currentTimeLabel = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const stats = summary?.stats;
  const netMonth = (stats?.monthlyIncome || 0) - (stats?.monthlyExpenses || 0);

  return (
    <div className="space-y-6">
      {/* Executive Welcome & Live Clock */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {currentDateLabel}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {admin.displayName || admin.username}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="font-mono text-foreground">{admin.username}</span> · Personal Office Command Overview
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-border bg-card px-4 py-2 text-right">
            <div className="text-[11px] font-medium text-muted-foreground">Local Time</div>
            <div className="font-mono text-base font-semibold tabular-nums text-foreground">
              {currentTimeLabel}
            </div>
          </div>

          <Button onClick={() => onNavigate('tasks')} size="md">
            <Plus className="h-4 w-4" />
            New Task
          </Button>
          <Button variant="outline" onClick={() => onNavigate('notes')} size="md">
            New Note
          </Button>
          <Button variant="outline" onClick={() => onNavigate('finance')} size="md">
            Record Transaction
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <Button variant="outline" size="sm" onClick={loadSummary}>
            Retry
          </Button>
        </div>
      )}

      {/* Primary KPI Strip */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Today&apos;s Tasks</span>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">
              {stats?.todayTasksCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              {stats?.totalTasksCount ?? 0} total tasks tracked
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Completed Tasks</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">
              {stats?.completedTasksCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
              {stats?.dailyProductivity ?? 0}% productivity score
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Pending Tasks</span>
              <CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">
              {stats?.pendingTasksCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Open across To Do, In Progress &amp; Hold
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Overdue Tasks</span>
              <AlertTriangle
                className={
                  (stats?.overdueTasksCount ?? 0) > 0
                    ? 'h-4 w-4 text-red-600 dark:text-red-400'
                    : 'h-4 w-4 text-muted-foreground'
                }
              />
            </div>
            <div
              className={`mt-3 font-mono text-2xl font-bold tabular-nums ${
                (stats?.overdueTasksCount ?? 0) > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-foreground'
              }`}
            >
              {stats?.overdueTasksCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {(stats?.overdueTasksCount ?? 0) > 0
                ? 'Requires immediate attention'
                : 'All deadlines on track'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Active Projects</span>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">
              {stats?.activeProjectsCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Planning &amp; active initiatives
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('notes')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Personal Notes</span>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">
              {stats?.totalNotesCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Active non-archived notes
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Monthly Income</span>
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">
              {formatCurrency(stats?.monthlyIncome ?? 0, admin.currency)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Current month inflow
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Monthly Expenses</span>
              <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">
              {formatCurrency(stats?.monthlyExpenses ?? 0, admin.currency)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              Net: {formatCurrency(netMonth, admin.currency)}
            </div>
          </button>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">7-Day Task Throughput</h2>
              <p className="text-xs text-muted-foreground">
                Tasks created vs completed over the past week
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              Full Report
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="h-64 w-full">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary?.productivitySeries || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="created" name="Created" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">6-Month Cash Flow ({admin.currency})</h2>
              <p className="text-xs text-muted-foreground">
                Monthly income vs operating expenses
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              Open Finance
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="h-64 w-full">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary?.financeSeries || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val: any) => formatCurrency(Number(val), admin.currency)}
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="income" name="Income" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Upcoming Deadlines + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Upcoming Deadlines</h2>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              View Calendar
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (summary?.upcomingDeadlines.length ?? 0) === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No upcoming deadlines in the next 14 days.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => onNavigate('tasks')}
              >
                Add a Task Deadline
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {summary!.upcomingDeadlines.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span>{item.type}</span>
                      <span aria-hidden="true"> · </span>
                      <span className={priorityTextClass(item.priority)}>{item.priority}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        item.isOverdue
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {formatDate(item.date, admin.dateFormat)}
                    </span>
                    {item.isOverdue && (
                      <div className="text-[11px] font-medium text-red-600 dark:text-red-400">
                        Overdue
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            <button
              type="button"
              onClick={() => onNavigate('activity')}
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              Full History
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (summary?.recentActivities.length ?? 0) === 0 ? (
            <div className="py-10 text-center">
              <Wallet className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Your workspace actions will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {summary!.recentActivities.slice(0, 7).map((act) => (
                <div key={act.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{act.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                      {act.entityType} · {act.action.replace('_', ' ')}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(act.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
