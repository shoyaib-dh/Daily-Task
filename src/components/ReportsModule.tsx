import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { exportRowsToCsv, formatCurrency, getTodayIso } from '../lib/utils';
import type { AdminProfile } from '../types/poms';
import { Button, Input, Label, Skeleton } from './ui/primitives';

interface ReportPayload {
  summary: {
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    totalProjects: number;
    avgProjectProgress: number;
    totalIncome: number;
    totalExpense: number;
    netBalance: number;
  };
  taskStatusCounts: Array<{ status: string; count: number }>;
  taskPriorityCounts: Array<{ priority: string; count: number }>;
  monthlyTaskReport: Array<{ month: string; completed: number; total: number }>;
  projectReport: Array<{
    id: number;
    name: string;
    status: string;
    priority: string;
    progress: number;
    budget: number;
    totalTasks: number;
    completedTasks: number;
    deadline: string | null;
  }>;
  financeByMonth: Array<{ month: string; income: number; expense: number }>;
  expenseByCategory: Array<{ category: string; amount: number }>;
  incomeByCategory: Array<{ category: string; amount: number }>;
}

const CHART_COLORS = ['#1d4ed8', '#16a34a', '#d97706', '#dc2626', '#64748b', '#0284c7'];

export function ReportsModule({ admin }: { admin: AdminProfile }) {
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadReport = async (from = fromDate, to = toDate) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await apiFetch<ReportPayload>(`/api/reports?${params.toString()}`);
      setReport(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport('', '');
  }, []);

  const handleExportCsv = () => {
    if (!report) return;
    exportRowsToCsv(
      ['Project', 'Status', 'Priority', 'Progress (%)', 'Tasks Completed', 'Total Tasks', 'Budget', 'Deadline'],
      report.projectReport.map((p) => [
        p.name,
        p.status,
        p.priority,
        p.progress,
        p.completedTasks,
        p.totalTasks,
        p.budget,
        p.deadline || '',
      ]),
      `poms-analytics-report-${getTodayIso()}.csv`
    );
    toast.success('Analytics report exported to CSV.');
  };

  const handleExportPdf = () => {
    if (!report) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Personal Office Management System — Analytics Report', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `Generated on ${getTodayIso()} | Range: ${fromDate || 'All time'} to ${toDate || 'Present'} | Admin: ${admin.username}`,
      14,
      25
    );

    autoTable(doc, {
      startY: 32,
      head: [['Metric', 'Value']],
      body: [
        ['Total Tasks', String(report.summary.totalTasks)],
        ['Completed Tasks', `${report.summary.completedTasks} (${report.summary.completionRate}%)`],
        ['Active / Total Projects', `${report.summary.totalProjects} (Avg ${report.summary.avgProjectProgress}%)`],
        ['Total Income', `${admin.currency} ${report.summary.totalIncome.toLocaleString()}`],
        ['Total Expenses', `${admin.currency} ${report.summary.totalExpense.toLocaleString()}`],
        ['Net Balance', `${admin.currency} ${report.summary.netBalance.toLocaleString()}`],
      ],
    });

    if (report.projectReport.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Project', 'Status', 'Progress', 'Tasks', 'Budget']],
        body: report.projectReport.map((p) => [
          p.name,
          p.status,
          `${p.progress}%`,
          `${p.completedTasks}/${p.totalTasks}`,
          `${admin.currency} ${p.budget.toLocaleString()}`,
        ]),
      });
    }

    doc.save(`poms-report-${getTodayIso()}.pdf`);
    toast.success('PDF report downloaded.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Reports &amp; Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time productivity, task completion, project progress, and financial performance reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportCsv} disabled={!report}>
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={handleExportPdf} disabled={!report}>
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Custom Date Range Filter */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <Label htmlFor="rep-from">From Date</Label>
          <Input
            id="rep-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-auto"
          />
        </div>
        <div>
          <Label htmlFor="rep-to">To Date</Label>
          <Input
            id="rep-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-auto"
          />
        </div>
        <Button onClick={() => loadReport(fromDate, toDate)}>Apply Date Range</Button>
        {(fromDate || toDate) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFromDate('');
              setToDate('');
              loadReport('', '');
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {loading || !report ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* Summary KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs font-medium text-muted-foreground">Task Completion Rate</div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
                {report.summary.completionRate}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                {report.summary.completedTasks} of {report.summary.totalTasks} tasks
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs font-medium text-muted-foreground">Average Project Progress</div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
                {report.summary.avgProjectProgress}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                Across {report.summary.totalProjects} projects
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs font-medium text-muted-foreground">Period Income</div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(report.summary.totalIncome, admin.currency)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Verified inflows</div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs font-medium text-muted-foreground">Period Net Balance</div>
              <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
                {formatCurrency(report.summary.netBalance, admin.currency)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground font-mono tabular-nums">
                Expenses: {formatCurrency(report.summary.totalExpense, admin.currency)}
              </div>
            </div>
          </div>

          {/* Visual Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                Monthly Task Completion Report
              </h2>
              <div className="h-64 w-full">
                {report.monthlyTaskReport.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
                    <BarChart3 className="h-6 w-6 mb-2" />
                    No task data in selected range.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.monthlyTaskReport}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="total" name="Total Tasks" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completed" name="Completed" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                Expense Distribution by Category
              </h2>
              <div className="h-64 w-full">
                {report.expenseByCategory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
                    No expense records in selected range.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={report.expenseByCategory}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        label={({ name }) => name}
                      >
                        {report.expenseByCategory.map((entry, idx) => (
                          <Cell
                            key={entry.category}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => formatCurrency(Number(val), admin.currency)}
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Project Progress Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-foreground">Project Progress Report</h2>
            </div>
            {report.projectReport.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No projects to report yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                      <th className="py-3 pl-5 pr-3">Project</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Tasks</th>
                      <th className="py-3 px-3 text-right">Budget</th>
                      <th className="py-3 pl-3 pr-5 text-right">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm">
                    {report.projectReport.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 pl-5 pr-3 font-medium text-foreground">{p.name}</td>
                        <td className="py-3 px-3 text-xs text-muted-foreground">{p.status}</td>
                        <td className="py-3 px-3 font-mono text-xs tabular-nums text-muted-foreground">
                          {p.completedTasks}/{p.totalTasks}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-foreground">
                          {formatCurrency(p.budget, admin.currency)}
                        </td>
                        <td className="py-3 pl-3 pr-5 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                          {p.progress}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
