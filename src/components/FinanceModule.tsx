import React, { useEffect, useMemo, useState } from 'react';
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
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import {
  exportRowsToCsv,
  formatCurrency,
  formatDate,
  getTodayIso,
} from '../lib/utils';
import type { AdminProfile, ProjectItem, TransactionItem } from '../types/poms';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from './ui/primitives';

const INCOME_CATEGORIES = ['Salary', 'Consulting', 'Project Fee', 'Business Revenue', 'Investment', 'Other Income'];
const EXPENSE_CATEGORIES = ['Office Rent', 'Software & Cloud', 'Utilities', 'Equipment', 'Transport', 'Marketing', 'Supplies', 'Other Expense'];
const PAYMENT_METHODS = ['Bank Transfer', 'bKash / Mobile Banking', 'Cash', 'Card', 'Cheque'];

interface FinanceModuleProps {
  admin: AdminProfile;
}

export function FinanceModule({ admin }: FinanceModuleProps) {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TransactionItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Consulting');
  const [transactionDate, setTransactionDate] = useState(getTodayIso());
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [txRes, projRes] = await Promise.all([
          apiFetch<{ transactions: TransactionItem[] }>('/api/transactions'),
          apiFetch<{ projects: ProjectItem[] }>('/api/projects'),
        ]);
        setTransactions(txRes.transactions);
        setProjects(projRes.projects);
      } catch (err: any) {
        toast.error(err.message || 'Failed to load financial records.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openCreate = (defaultType: 'income' | 'expense' = 'income') => {
    setEditing(null);
    setType(defaultType);
    setAmount('');
    setCategory(defaultType === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
    setTransactionDate(getTodayIso());
    setPaymentMethod('Bank Transfer');
    setDescription('');
    setReference('');
    setProjectId('');
    setModalOpen(true);
  };

  const openEdit = (tx: TransactionItem) => {
    setEditing(tx);
    setType(tx.type);
    setAmount(String(Number(tx.amount)));
    setCategory(tx.category);
    setTransactionDate(tx.transactionDate);
    setPaymentMethod(tx.paymentMethod);
    setDescription(tx.description || '');
    setReference(tx.reference || '');
    setProjectId(tx.projectId ? String(tx.projectId) : '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const amtNum = Number(amount);
    if (!amtNum || amtNum <= 0) {
      toast.error('Enter a valid amount greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type,
        amount: amtNum,
        category: category.trim() || 'General',
        transactionDate,
        paymentMethod,
        description,
        reference,
        projectId: projectId ? Number(projectId) : null,
      };
      if (editing) {
        const res = await apiFetch<{ transaction: TransactionItem }>(
          `/api/transactions/${editing.id}`,
          { method: 'PUT', body: JSON.stringify(payload) }
        );
        setTransactions((prev) => prev.map((x) => (x.id === res.transaction.id ? res.transaction : x)));
        toast.success('Transaction updated.');
      } else {
        const res = await apiFetch<{ transaction: TransactionItem }>('/api/transactions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setTransactions((prev) => [res.transaction, ...prev]);
        toast.success(`${type === 'income' ? 'Income' : 'Expense'} recorded.`);
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Unable to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/transactions/${deleteTarget.id}`, { method: 'DELETE' });
      setTransactions((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success('Transaction deleted.');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete transaction.');
    } finally {
      setSaving(false);
    }
  };

  const curMonth = getTodayIso().slice(0, 7);

  const summary = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let monthIncome = 0;
    let monthExpense = 0;

    transactions.forEach((tx) => {
      const amt = Number(tx.amount || 0);
      if (tx.type === 'income') {
        totalIncome += amt;
        if (tx.transactionDate.startsWith(curMonth)) monthIncome += amt;
      } else {
        totalExpense += amt;
        if (tx.transactionDate.startsWith(curMonth)) monthExpense += amt;
      }
    });

    return {
      totalIncome,
      totalExpense,
      totalBalance: totalIncome - totalExpense,
      monthIncome,
      monthExpense,
    };
  }, [transactions, curMonth]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.category));
    return Array.from(set).sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
      if (fromDate && tx.transactionDate < fromDate) return false;
      if (toDate && tx.transactionDate > toDate) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          tx.category.toLowerCase().includes(q) ||
          (tx.description || '').toLowerCase().includes(q) ||
          (tx.paymentMethod || '').toLowerCase().includes(q) ||
          (tx.reference || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, fromDate, toDate, search]);

  const monthlyChartData = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    filtered.forEach((tx) => {
      const m = tx.transactionDate.slice(0, 7);
      const cur = map.get(m) || { month: m, income: 0, expense: 0 };
      if (tx.type === 'income') cur.income += Number(tx.amount);
      else cur.expense += Number(tx.amount);
      map.set(m, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const handleExportCsv = () => {
    exportRowsToCsv(
      ['Date', 'Type', 'Category', 'Amount', 'Payment Method', 'Reference', 'Description'],
      filtered.map((t) => [
        t.transactionDate,
        t.type,
        t.category,
        Number(t.amount),
        t.paymentMethod,
        t.reference,
        t.description,
      ]),
      `poms-finance-${getTodayIso()}.csv`
    );
    toast.success('Financial report exported to CSV.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Finance ({admin.currency})
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track personal and office income, expenses, payment methods, and net cash flow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => openCreate('expense')}>
            <TrendingDown className="h-4 w-4 text-red-600" />
            Record Expense
          </Button>
          <Button onClick={() => openCreate('income')}>
            <Plus className="h-4 w-4" />
            Record Income
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Monthly Income</span>
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCurrency(summary.monthIncome, admin.currency)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground font-mono tabular-nums">
            Lifetime: {formatCurrency(summary.totalIncome, admin.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Monthly Expenses</span>
            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
            {formatCurrency(summary.monthExpense, admin.currency)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground font-mono tabular-nums">
            Lifetime: {formatCurrency(summary.totalExpense, admin.currency)}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Total Balance</span>
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
            {formatCurrency(summary.totalBalance, admin.currency)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground font-mono tabular-nums">
            This month net: {formatCurrency(summary.monthIncome - summary.monthExpense, admin.currency)}
          </div>
        </div>
      </div>

      {/* Chart */}
      {monthlyChartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Monthly Income vs Expense Trend
          </h2>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
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
                  formatter={(v: any) => formatCurrency(Number(v), admin.currency)}
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
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card p-3.5">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, category, ref..."
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className="w-auto"
        >
          <option value="all">All Types</option>
          <option value="income">Income Only</option>
          <option value="expense">Expenses Only</option>
        </Select>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-auto"
        >
          <option value="all">All Categories</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="w-auto"
          aria-label="From date"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="w-auto"
          aria-label="To date"
        />
      </div>

      {/* Transactions Table */}
      {loading ? (
        <Skeleton className="h-56" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No transactions recorded"
          description="Log your office income and expenses in BDT (৳) to track cash flow and generate financial reports."
          actionLabel="Record First Transaction"
          onAction={() => openCreate('income')}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                <th className="py-3 pl-4 pr-3">Date</th>
                <th className="py-3 px-3">Category &amp; Description</th>
                <th className="py-3 px-3">Payment Method</th>
                <th className="py-3 px-3 text-right">Amount ({admin.currency})</th>
                <th className="py-3 pl-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/40 transition-colors">
                  <td className="py-3 pl-4 pr-3 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDate(tx.transactionDate, admin.dateFormat)}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-foreground">{tx.category}</div>
                    {(tx.description || tx.reference) && (
                      <div className="text-xs text-muted-foreground">
                        {tx.description}
                        {tx.reference ? ` · Ref: ${tx.reference}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-xs text-muted-foreground">{tx.paymentMethod}</td>
                  <td
                    className={`py-3 px-3 text-right font-mono font-semibold tabular-nums ${
                      tx.type === 'income'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {formatCurrency(tx.amount, admin.currency)}
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(tx)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(tx)}>
                        <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Transaction' : 'Record Financial Transaction'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            {(['income', 'expense'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t);
                  setCategory(t === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
                }}
                className={`rounded-md py-1.5 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  type === t
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-amount">Amount ({admin.currency})</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="15000"
                required
              />
            </div>
            <div>
              <Label htmlFor="tx-date">Transaction Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-category">Category</Label>
              <Input
                id="tx-category"
                list="tx-category-suggestions"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
              <datalist id="tx-category-suggestions">
                {(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="tx-method">Payment Method</Label>
              <Select
                id="tx-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-ref">Reference / Invoice #</Label>
              <Input
                id="tx-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="INV-2026-01"
              />
            </div>
            <div>
              <Label htmlFor="tx-project">Related Project</Label>
              <Select
                id="tx-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="tx-desc">Description</Label>
            <Textarea
              id="tx-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Transaction details..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Record Transaction'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Transaction"
        description={`Remove this ${deleteTarget?.type} record (${formatCurrency(deleteTarget?.amount || 0, admin.currency)})?`}
        loading={saving}
      />
    </div>
  );
}
