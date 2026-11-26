import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  BDT: '৳',
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
};

export function formatCurrency(amount: number | string, currency = 'BDT'): string {
  const num = Number(amount || 0);
  const symbol = CURRENCY_SYMBOLS[currency] || '৳';
  const formatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function formatDate(dateStr?: string | null, format = 'YYYY-MM-DD'): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;

  if (format === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
  if (format === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
  if (format === 'DD MMM YYYY') {
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return dt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  return `${y}-${m}-${d}`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function priorityTextClass(priority: string): string {
  switch (priority) {
    case 'Urgent':
      return 'text-red-600 dark:text-red-400 font-semibold';
    case 'High':
      return 'text-amber-600 dark:text-amber-400 font-medium';
    case 'Medium':
      return 'text-blue-700 dark:text-blue-400 font-medium';
    default:
      return 'text-slate-500 dark:text-slate-400';
  }
}

export function statusTextClass(status: string): string {
  switch (status) {
    case 'Completed':
      return 'text-emerald-700 dark:text-emerald-400 font-medium';
    case 'In Progress':
    case 'Active':
      return 'text-blue-700 dark:text-blue-400 font-medium';
    case 'On Hold':
    case 'Planning':
      return 'text-amber-700 dark:text-amber-400 font-medium';
    case 'Cancelled':
      return 'text-red-600 dark:text-red-400 font-medium';
    default:
      return 'text-slate-600 dark:text-slate-400';
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRowsToCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>, filename: string) {
  const escapeCell = (val: string | number | null | undefined) => {
    const str = String(val ?? '');
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}
