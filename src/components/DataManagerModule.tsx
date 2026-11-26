import React, { useEffect, useRef, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/browser';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Eye,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { exportRowsToCsv, formatDateTime } from '../lib/utils';
import type {
  AdminProfile,
  CustomFieldDef,
  CustomFieldType,
  CustomRecordItem,
  DataCategoryItem,
} from '../types/poms';
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

interface DataManagerModuleProps {
  admin: AdminProfile;
}

const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'date', 'email', 'phone', 'dropdown'];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

export function DataManagerModule({ admin: _admin }: DataManagerModuleProps) {
  const [categories, setCategories] = useState<DataCategoryItem[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [records, setRecords] = useState<CustomRecordItem[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 12, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<DataCategoryItem | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catFields, setCatFields] = useState<CustomFieldDef[]>([]);
  const [deleteCatTarget, setDeleteCatTarget] = useState<DataCategoryItem | null>(null);

  // Record modal
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<CustomRecordItem | null>(null);
  const [recTitle, setRecTitle] = useState('');
  const [recData, setRecData] = useState<Record<string, string>>({});
  const [recNotes, setRecNotes] = useState('');
  const [viewRecord, setViewRecord] = useState<CustomRecordItem | null>(null);
  const [deleteRecTarget, setDeleteRecTarget] = useState<CustomRecordItem | null>(null);
  const [saving, setSaving] = useState(false);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ categories: DataCategoryItem[] }>('/api/data-categories');
      setCategories(res.categories);
      if (res.categories.length > 0 && !selectedCatId) {
        setSelectedCatId(res.categories[0].id);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load data categories.');
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (catId: number | null, pageNum = 1, q = search) => {
    if (!catId) {
      setRecords([]);
      return;
    }
    setRecordsLoading(true);
    try {
      const params = new URLSearchParams({
        categoryId: String(catId),
        page: String(pageNum),
        pageSize: '12',
      });
      if (q.trim()) params.set('search', q.trim());
      const res = await apiFetch<{
        records: CustomRecordItem[];
        pagination: { total: number; page: number; pageSize: number; totalPages: number };
      }>(`/api/records?${params.toString()}`);
      setRecords(res.records);
      setPagination(res.pagination);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load records.');
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCatId) {
      loadRecords(selectedCatId, 1, search);
    }
  }, [selectedCatId, search]);

  const activeCategory = categories.find((c) => c.id === selectedCatId) || null;

  // Category CRUD
  const openCreateCategory = () => {
    setEditingCat(null);
    setCatName('');
    setCatDesc('');
    setCatFields([
      { name: 'Email', fieldKey: 'email', fieldType: 'email', options: [], required: false },
      { name: 'Phone', fieldKey: 'phone', fieldType: 'phone', options: [], required: false },
      {
        name: 'Status',
        fieldKey: 'status',
        fieldType: 'dropdown',
        options: ['Active', 'Pending', 'Closed'],
        required: false,
      },
    ]);
    setCatModalOpen(true);
  };

  const openEditCategory = (cat: DataCategoryItem) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatDesc(cat.description || '');
    setCatFields(
      cat.fields.map((f) => ({
        ...f,
        options: f.options || [],
      }))
    );
    setCatModalOpen(true);
  };

  const addCustomFieldRow = () => {
    setCatFields((prev) => [
      ...prev,
      { name: '', fieldKey: '', fieldType: 'text', options: [], required: false },
    ]);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      toast.error('Category name is required.');
      return;
    }
    const cleanFields = catFields
      .filter((f) => f.name.trim())
      .map((f, idx) => ({
        name: f.name.trim(),
        fieldKey:
          f.fieldKey?.trim() ||
          f.name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '') ||
          `field_${idx}`,
        fieldType: f.fieldType,
        options: f.fieldType === 'dropdown' ? f.options.filter(Boolean) : [],
        required: Boolean(f.required),
        sortOrder: idx,
      }));

    setSaving(true);
    try {
      if (editingCat) {
        await apiFetch(`/api/data-categories/${editingCat.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: catName.trim(),
            description: catDesc,
            fields: cleanFields,
          }),
        });
        toast.success('Data category updated.');
      } else {
        const res = await apiFetch<{ category: DataCategoryItem }>('/api/data-categories', {
          method: 'POST',
          body: JSON.stringify({
            name: catName.trim(),
            description: catDesc,
            fields: cleanFields,
          }),
        });
        setSelectedCatId(res.category.id);
        toast.success('Data category created.');
      }
      setCatModalOpen(false);
      await loadCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCatTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/data-categories/${deleteCatTarget.id}`, { method: 'DELETE' });
      const nextCats = categories.filter((c) => c.id !== deleteCatTarget.id);
      setCategories(nextCats);
      if (selectedCatId === deleteCatTarget.id) {
        setSelectedCatId(nextCats[0]?.id ?? null);
      }
      setDeleteCatTarget(null);
      toast.success('Category deleted.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete category.');
    } finally {
      setSaving(false);
    }
  };

  // Record CRUD
  const openCreateRecord = () => {
    if (!activeCategory) return;
    setEditingRec(null);
    setRecTitle('');
    const init: Record<string, string> = {};
    activeCategory.fields.forEach((f) => {
      init[f.fieldKey] = '';
    });
    setRecData(init);
    setRecNotes('');
    setRecModalOpen(true);
  };

  const openEditRecord = (rec: CustomRecordItem) => {
    if (!activeCategory) return;
    setEditingRec(rec);
    setRecTitle(rec.title);
    const init: Record<string, string> = {};
    activeCategory.fields.forEach((f) => {
      init[f.fieldKey] = String(rec.data?.[f.fieldKey] ?? '');
    });
    setRecData(init);
    setRecNotes(rec.notes || '');
    setRecModalOpen(true);
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory || !recTitle.trim()) {
      toast.error('Record title is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        categoryId: activeCategory.id,
        title: recTitle.trim(),
        data: recData,
        notes: recNotes,
      };
      if (editingRec) {
        await apiFetch(`/api/records/${editingRec.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success('Record updated.');
      } else {
        await apiFetch('/api/records', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Record added.');
      }
      setRecModalOpen(false);
      await Promise.all([loadRecords(activeCategory.id, pagination.page, search), loadCategories()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save record.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!deleteRecTarget || !activeCategory) return;
    setSaving(true);
    try {
      await apiFetch(`/api/records/${deleteRecTarget.id}`, { method: 'DELETE' });
      setDeleteRecTarget(null);
      toast.success('Record deleted.');
      await Promise.all([loadRecords(activeCategory.id, pagination.page, search), loadCategories()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete record.');
    } finally {
      setSaving(false);
    }
  };

  // Export CSV & Excel
  const handleExportCsv = () => {
    if (!activeCategory) return;
    const headers = ['Title', ...activeCategory.fields.map((f) => f.name), 'Notes'];
    const rows = records.map((r) => [
      r.title,
      ...activeCategory.fields.map((f) => r.data?.[f.fieldKey] ?? ''),
      r.notes || '',
    ]);
    exportRowsToCsv(headers, rows, `${activeCategory.name.toLowerCase().replace(/\s+/g, '-')}.csv`);
    toast.success('Exported CSV.');
  };

  const handleExportExcel = async () => {
    if (!activeCategory) return;
    try {
      const headerRow: Row = [
        { value: 'Title', fontWeight: 'bold' },
        ...activeCategory.fields.map((f) => ({ value: f.name, fontWeight: 'bold' as const })),
        { value: 'Notes', fontWeight: 'bold' },
      ];
      const bodyRows: Row[] = records.map((r) => [
        { type: String, value: r.title },
        ...activeCategory.fields.map((f) => ({
          type: String,
          value: String(r.data?.[f.fieldKey] ?? ''),
        })),
        { type: String, value: r.notes || '' },
      ]);
      const sheetData: SheetData = [headerRow, ...bodyRows];
      await writeXlsxFile(sheetData, {
        sheet: activeCategory.name.slice(0, 31) || 'Records',
      }).toFile(`${activeCategory.name.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
      toast.success('Exported Excel spreadsheet.');
    } catch (err: any) {
      toast.error(err.message || 'Excel export failed.');
    }
  };

  // Import CSV / Excel (.xlsx)
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeCategory) return;

    try {
      let matrix: string[][] = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        matrix = text
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0)
          .map(parseCsvLine);
      } else {
        const rows = await readSheet(file);
        matrix = rows.map((r) => r.map((cell) => (cell == null ? '' : String(cell))));
      }

      if (matrix.length < 2) {
        toast.error('File must include a header row and at least one data row.');
        return;
      }

      const headers = matrix[0].map((h) => h.trim());
      const dataRows = matrix.slice(1, 501);

      const mapped = dataRows.map((cells, idx) => {
        const rowObj: Record<string, string> = {};
        headers.forEach((h, i) => {
          rowObj[h] = cells[i] ?? '';
        });
        const titleVal =
          rowObj.Title ||
          rowObj.title ||
          rowObj.Name ||
          rowObj.name ||
          cells[0] ||
          `Imported Row ${idx + 1}`;
        const customData: Record<string, string> = {};
        activeCategory.fields.forEach((f) => {
          const val = rowObj[f.name] ?? rowObj[f.fieldKey] ?? '';
          customData[f.fieldKey] = String(val);
        });
        return {
          title: String(titleVal).slice(0, 200),
          data: customData,
          notes: String(rowObj.Notes || rowObj.notes || ''),
        };
      });

      const res = await apiFetch<{ importedCount: number }>('/api/records/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ categoryId: activeCategory.id, rows: mapped }),
      });
      toast.success(`Imported ${res.importedCount} records.`);
      await Promise.all([loadRecords(activeCategory.id, 1, search), loadCategories()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to import file. Verify CSV or XLSX format.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Data Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create custom categories with structured fields, manage records, and import/export CSV &amp; Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={openCreateCategory}>
            <Plus className="h-4 w-4" />
            New Category
          </Button>
          {activeCategory && (
            <Button onClick={openCreateRecord}>
              <Plus className="h-4 w-4" />
              Add Record
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No data categories defined"
          description="Create your first data category (for example: Clients, Vendors, Assets, Invoices, or Contacts) with custom fields."
          actionLabel="Create Data Category"
          onAction={openCreateCategory}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Categories Sidebar */}
          <div className="xl:col-span-3 rounded-xl border border-border bg-card p-3 h-fit space-y-1">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Data Categories
            </div>
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors ${
                  selectedCatId === cat.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCatId(cat.id)}
                  className="flex-1 text-left min-w-0 cursor-pointer"
                >
                  <div className="truncate text-sm font-medium">{cat.name}</div>
                  <div className="text-[11px] opacity-75 tabular-nums">
                    {cat.recordCount} records · {cat.fields.length} fields
                  </div>
                </button>
                <div className="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditCategory(cat)}
                    className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label={`Configure ${cat.name}`}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteCatTarget(cat)}
                    className="p-1 text-muted-foreground hover:text-red-600 cursor-pointer"
                    aria-label={`Delete ${cat.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Records Table Workspace */}
          <div className="xl:col-span-9 space-y-4">
            {activeCategory && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={`Search ${activeCategory.name} records...`}
                      className="pl-9"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleImportFile}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => importInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Import CSV/Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCsv}>
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportExcel}>
                      <Download className="h-3.5 w-3.5" />
                      Excel
                    </Button>
                  </div>
                </div>

                {recordsLoading ? (
                  <Skeleton className="h-56" />
                ) : records.length === 0 ? (
                  <EmptyState
                    icon={Database}
                    title={`No records in ${activeCategory.name}`}
                    description="Add individual records or import an existing CSV / Excel spreadsheet."
                    actionLabel="Add First Record"
                    onAction={openCreateRecord}
                  />
                ) : (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                            <th className="py-3 pl-4 pr-3">Title</th>
                            {activeCategory.fields.slice(0, 4).map((f) => (
                              <th key={f.fieldKey} className="py-3 px-3">
                                {f.name}
                              </th>
                            ))}
                            <th className="py-3 pl-3 pr-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-sm">
                          {records.map((r) => (
                            <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                              <td className="py-3 pl-4 pr-3 font-medium text-foreground">
                                {r.title}
                              </td>
                              {activeCategory.fields.slice(0, 4).map((f) => (
                                <td
                                  key={f.fieldKey}
                                  className={`py-3 px-3 text-muted-foreground ${
                                    f.fieldType === 'number' || f.fieldType === 'date'
                                      ? 'font-mono text-xs tabular-nums'
                                      : ''
                                  }`}
                                >
                                  {String(r.data?.[f.fieldKey] ?? '—') || '—'}
                                </td>
                              ))}
                              <td className="py-3 pl-3 pr-4 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setViewRecord(r)}
                                    aria-label="View details"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditRecord(r)}
                                    aria-label="Edit record"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setDeleteRecTarget(r)}
                                    aria-label="Delete record"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        Page {pagination.page} of {pagination.totalPages} ({pagination.total}{' '}
                        records)
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pagination.page <= 1}
                          onClick={() =>
                            loadRecords(activeCategory.id, pagination.page - 1, search)
                          }
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pagination.page >= pagination.totalPages}
                          onClick={() =>
                            loadRecords(activeCategory.id, pagination.page + 1, search)
                          }
                        >
                          Next
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Category & Custom Field Builder Modal */}
      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={editingCat ? 'Configure Data Category' : 'Create Data Category'}
        description="Define custom fields (text, number, date, email, phone, dropdown) for structured data entry."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dc-name">Category Name</Label>
              <Input
                id="dc-name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Clients, Vendors, Office Assets..."
                required
              />
            </div>
            <div>
              <Label htmlFor="dc-desc">Description</Label>
              <Input
                id="dc-desc"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                placeholder="Short description of records"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Custom Fields</Label>
              <Button type="button" variant="outline" size="sm" onClick={addCustomFieldRow}>
                <Plus className="h-3.5 w-3.5" />
                Add Field
              </Button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {catFields.map((field, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 rounded-lg border border-border p-2.5 items-center"
                >
                  <div className="sm:col-span-4">
                    <Input
                      value={field.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCatFields((prev) =>
                          prev.map((f, i) => (i === idx ? { ...f, name: val } : f))
                        );
                      }}
                      placeholder="Field label"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Select
                      value={field.fieldType}
                      onChange={(e) => {
                        const val = e.target.value as CustomFieldType;
                        setCatFields((prev) =>
                          prev.map((f, i) => (i === idx ? { ...f, fieldType: val } : f))
                        );
                      }}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-4">
                    {field.fieldType === 'dropdown' ? (
                      <Input
                        value={(field.options || []).join(', ')}
                        onChange={(e) => {
                          const opts = e.target.value.split(',').map((s) => s.trim());
                          setCatFields((prev) =>
                            prev.map((f, i) => (i === idx ? { ...f, options: opts } : f))
                          );
                        }}
                        placeholder="Options (comma sep)"
                      />
                    ) : (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground pl-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            setCatFields((prev) =>
                              prev.map((f, i) =>
                                i === idx ? { ...f, required: e.target.checked } : f
                              )
                            )
                          }
                        />
                        Required field
                      </label>
                    )}
                  </div>
                  <div className="sm:col-span-1 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setCatFields((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingCat ? 'Save Category' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create / Edit Record Modal */}
      <Modal
        open={recModalOpen}
        onClose={() => setRecModalOpen(false)}
        title={editingRec ? 'Edit Record' : `Add ${activeCategory?.name || 'Record'}`}
      >
        <form onSubmit={handleSaveRecord} className="space-y-4">
          <div>
            <Label htmlFor="rec-title">Record Title / Name</Label>
            <Input
              id="rec-title"
              value={recTitle}
              onChange={(e) => setRecTitle(e.target.value)}
              placeholder="Primary identifier"
              required
            />
          </div>

          {activeCategory?.fields.map((f) => (
            <div key={f.fieldKey}>
              <Label htmlFor={`rec-${f.fieldKey}`}>
                {f.name} {f.required ? '*' : ''}
              </Label>
              {f.fieldType === 'dropdown' ? (
                <Select
                  id={`rec-${f.fieldKey}`}
                  value={recData[f.fieldKey] || ''}
                  required={f.required}
                  onChange={(e) =>
                    setRecData((prev) => ({ ...prev, [f.fieldKey]: e.target.value }))
                  }
                >
                  <option value="">Select {f.name}</option>
                  {(f.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={`rec-${f.fieldKey}`}
                  type={
                    f.fieldType === 'phone'
                      ? 'tel'
                      : f.fieldType === 'email'
                        ? 'email'
                        : f.fieldType === 'number'
                          ? 'number'
                          : f.fieldType === 'date'
                            ? 'date'
                            : 'text'
                  }
                  value={recData[f.fieldKey] || ''}
                  required={f.required}
                  onChange={(e) =>
                    setRecData((prev) => ({ ...prev, [f.fieldKey]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}

          <div>
            <Label htmlFor="rec-notes">Additional Notes</Label>
            <Textarea
              id="rec-notes"
              value={recNotes}
              onChange={(e) => setRecNotes(e.target.value)}
              placeholder="Optional remarks..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setRecModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingRec ? 'Save Record' : 'Add Record'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Detail Modal */}
      <Modal
        open={Boolean(viewRecord)}
        onClose={() => setViewRecord(null)}
        title={viewRecord?.title || 'Record Details'}
        description={
          viewRecord
            ? `${activeCategory?.name || ''} · Created ${formatDateTime(viewRecord.createdAt)}`
            : undefined
        }
      >
        {viewRecord && activeCategory && (
          <div className="space-y-4">
            <div className="divide-y divide-border rounded-lg border border-border">
              {activeCategory.fields.map((f) => (
                <div key={f.fieldKey} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">{f.name}</span>
                  <span className="font-medium text-foreground">
                    {String(viewRecord.data?.[f.fieldKey] ?? '—') || '—'}
                  </span>
                </div>
              ))}
            </div>
            {viewRecord.notes && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Notes</div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{viewRecord.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteCatTarget)}
        onClose={() => setDeleteCatTarget(null)}
        onConfirm={handleDeleteCategory}
        title="Delete Data Category"
        description={`Deleting "${deleteCatTarget?.name}" will permanently delete all records inside this category.`}
        loading={saving}
      />

      <ConfirmDialog
        open={Boolean(deleteRecTarget)}
        onClose={() => setDeleteRecTarget(null)}
        onConfirm={handleDeleteRecord}
        title="Delete Record"
        description={`Permanently delete "${deleteRecTarget?.title}"?`}
        loading={saving}
      />
    </div>
  );
}
