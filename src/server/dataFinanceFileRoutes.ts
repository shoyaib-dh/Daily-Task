import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  activityLogs,
  customFields,
  customRecords,
  dataCategories,
  files,
  notifications,
  projects,
  tasks,
  transactions,
} from '../db/schema.ts';
import { exportFullBackup, logActivity } from '../db/repository.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8 MB max per document
  },
});

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 160) || 'document';
}

// ===================== DATA MANAGER: CATEGORIES & CUSTOM FIELDS =====================
const fieldDefSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80),
  fieldKey: z.string().trim().min(1).max(80).optional(),
  fieldType: z.enum(['text', 'number', 'date', 'email', 'phone', 'dropdown']).default('text'),
  options: z.array(z.string().trim().max(80)).max(50).optional().default([]),
  required: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

const dataCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  description: z.string().max(500).optional().default(''),
  fields: z.array(fieldDefSchema).max(30).optional().default([]),
});

function toFieldKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'field'
  );
}

router.get('/data-categories', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const [cats, allFields, allRecs] = await Promise.all([
      db
        .select()
        .from(dataCategories)
        .where(eq(dataCategories.ownerId, ownerId))
        .orderBy(dataCategories.name),
      db.select().from(customFields).orderBy(customFields.sortOrder, customFields.id),
      db.select({ id: customRecords.id, categoryId: customRecords.categoryId })
        .from(customRecords)
        .where(eq(customRecords.ownerId, ownerId)),
    ]);

    const result = cats.map((c) => ({
      ...c,
      fields: allFields.filter((f) => f.categoryId === c.id),
      recordCount: allRecs.filter((r) => r.categoryId === c.id).length,
    }));

    return res.json({ categories: result });
  } catch (error: any) {
    console.error('List data categories error:', error);
    return res.status(500).json({ error: 'Failed to load data categories.' });
  }
});

router.post('/data-categories', async (req: AuthRequest, res) => {
  try {
    const parsed = dataCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid data category.' });
    }
    const ownerId = req.admin!.id;
    const [cat] = await db
      .insert(dataCategories)
      .values({
        ownerId,
        name: parsed.data.name,
        description: parsed.data.description,
      })
      .returning();

    const createdFields = [];
    for (let i = 0; i < parsed.data.fields.length; i++) {
      const f = parsed.data.fields[i];
      const [cf] = await db
        .insert(customFields)
        .values({
          categoryId: cat.id,
          name: f.name,
          fieldKey: f.fieldKey || toFieldKey(f.name),
          fieldType: f.fieldType,
          options: f.options || [],
          required: Boolean(f.required),
          sortOrder: i,
        })
        .returning();
      createdFields.push(cf);
    }

    await logActivity(ownerId, 'created', 'record', `Created data category "${cat.name}"`, cat.id);
    return res.status(201).json({ category: { ...cat, fields: createdFields, recordCount: 0 } });
  } catch (error: any) {
    console.error('Create data category error:', error);
    return res.status(500).json({ error: 'Failed to create data category.' });
  }
});

router.put('/data-categories/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid category ID.' });
    const parsed = dataCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid category update.' });
    }
    const ownerId = req.admin!.id;
    const [updated] = await db
      .update(dataCategories)
      .set({
        name: parsed.data.name,
        description: parsed.data.description,
        updatedAt: new Date(),
      })
      .where(and(eq(dataCategories.id, id), eq(dataCategories.ownerId, ownerId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Category not found.' });

    // Replace custom fields definition cleanly
    await db.delete(customFields).where(eq(customFields.categoryId, id));
    const createdFields = [];
    for (let i = 0; i < parsed.data.fields.length; i++) {
      const f = parsed.data.fields[i];
      const [cf] = await db
        .insert(customFields)
        .values({
          categoryId: id,
          name: f.name,
          fieldKey: f.fieldKey || toFieldKey(f.name),
          fieldType: f.fieldType,
          options: f.options || [],
          required: Boolean(f.required),
          sortOrder: i,
        })
        .returning();
      createdFields.push(cf);
    }

    return res.json({ category: { ...updated, fields: createdFields } });
  } catch (error: any) {
    console.error('Update data category error:', error);
    return res.status(500).json({ error: 'Failed to update data category.' });
  }
});

router.delete('/data-categories/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid category ID.' });
    const ownerId = req.admin!.id;
    const [deleted] = await db
      .delete(dataCategories)
      .where(and(eq(dataCategories.id, id), eq(dataCategories.ownerId, ownerId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Category not found.' });

    await logActivity(ownerId, 'deleted', 'record', `Deleted data category "${deleted.name}"`, deleted.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete data category error:', error);
    return res.status(500).json({ error: 'Failed to delete category.' });
  }
});

// ===================== CUSTOM RECORDS =====================
const customRecordSchema = z.object({
  categoryId: z.number().int().positive(),
  title: z.string().trim().min(1, 'Record title is required').max(200),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional().default({}),
  notes: z.string().max(5000).optional().default(''),
});

router.get('/records', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const categoryId = req.query.categoryId ? parseId(String(req.query.categoryId)) : null;
    const search = String(req.query.search || '').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 15) || 15));

    const whereCond = categoryId
      ? and(eq(customRecords.ownerId, ownerId), eq(customRecords.categoryId, categoryId))
      : eq(customRecords.ownerId, ownerId);

    let rows = await db
      .select()
      .from(customRecords)
      .where(whereCond)
      .orderBy(desc(customRecords.createdAt));

    if (search) {
      rows = rows.filter((r) => {
        if (r.title.toLowerCase().includes(search)) return true;
        if ((r.notes || '').toLowerCase().includes(search)) return true;
        return Object.values(r.data || {}).some((v) =>
          String(v ?? '').toLowerCase().includes(search)
        );
      });
    }

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const paginated = rows.slice(start, start + pageSize);

    return res.json({
      records: paginated,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error: any) {
    console.error('List records error:', error);
    return res.status(500).json({ error: 'Failed to load records.' });
  }
});

router.post('/records', async (req: AuthRequest, res) => {
  try {
    const parsed = customRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid record.' });
    }
    const ownerId = req.admin!.id;
    // Verify category ownership
    const [cat] = await db
      .select()
      .from(dataCategories)
      .where(and(eq(dataCategories.id, parsed.data.categoryId), eq(dataCategories.ownerId, ownerId)))
      .limit(1);
    if (!cat) return res.status(404).json({ error: 'Data category not found.' });

    const [created] = await db
      .insert(customRecords)
      .values({
        ownerId,
        categoryId: parsed.data.categoryId,
        title: parsed.data.title,
        data: parsed.data.data,
        notes: parsed.data.notes,
      })
      .returning();

    await logActivity(ownerId, 'created', 'record', `Added record "${created.title}" in ${cat.name}`, created.id);
    return res.status(201).json({ record: created });
  } catch (error: any) {
    console.error('Create record error:', error);
    return res.status(500).json({ error: 'Failed to create record.' });
  }
});

router.post('/records/bulk-import', async (req: AuthRequest, res) => {
  try {
    const bulkSchema = z.object({
      categoryId: z.number().int().positive(),
      rows: z.array(
        z.object({
          title: z.string().trim().min(1).max(200),
          data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
          notes: z.string().max(2000).optional().default(''),
        })
      ).min(1).max(500),
    });

    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid import data.' });
    }
    const ownerId = req.admin!.id;
    const [cat] = await db
      .select()
      .from(dataCategories)
      .where(and(eq(dataCategories.id, parsed.data.categoryId), eq(dataCategories.ownerId, ownerId)))
      .limit(1);
    if (!cat) return res.status(404).json({ error: 'Data category not found.' });

    const inserted = await db
      .insert(customRecords)
      .values(
        parsed.data.rows.map((r) => ({
          ownerId,
          categoryId: parsed.data.categoryId,
          title: r.title,
          data: r.data,
          notes: r.notes || '',
        }))
      )
      .returning();

    await logActivity(
      ownerId,
      'created',
      'record',
      `Imported ${inserted.length} records into "${cat.name}"`,
      cat.id
    );
    return res.status(201).json({ importedCount: inserted.length, records: inserted });
  } catch (error: any) {
    console.error('Bulk import error:', error);
    return res.status(500).json({ error: 'Failed to import records.' });
  }
});

router.put('/records/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid record ID.' });
    const parsed = customRecordSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid record update.' });
    }
    const ownerId = req.admin!.id;
    const [updated] = await db
      .update(customRecords)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(customRecords.id, id), eq(customRecords.ownerId, ownerId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Record not found.' });

    await logActivity(ownerId, 'updated', 'record', `Updated record "${updated.title}"`, updated.id);
    return res.json({ record: updated });
  } catch (error: any) {
    console.error('Update record error:', error);
    return res.status(500).json({ error: 'Failed to update record.' });
  }
});

router.delete('/records/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid record ID.' });
    const ownerId = req.admin!.id;
    const [deleted] = await db
      .delete(customRecords)
      .where(and(eq(customRecords.id, id), eq(customRecords.ownerId, ownerId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Record not found.' });

    await logActivity(ownerId, 'deleted', 'record', `Deleted record "${deleted.title}"`, deleted.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete record error:', error);
    return res.status(500).json({ error: 'Failed to delete record.' });
  }
});

// ===================== FINANCE (INCOME & EXPENSE) =====================
const transactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.union([z.number(), z.string()]).refine((v) => Number(v) > 0, {
    message: 'Amount must be greater than zero',
  }),
  category: z.string().trim().min(1, 'Category is required').max(80),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  paymentMethod: z.string().trim().min(1).max(60).optional().default('Bank Transfer'),
  description: z.string().max(1000).optional().default(''),
  reference: z.string().max(100).optional().default(''),
  projectId: z.number().int().positive().nullable().optional(),
});

router.get('/transactions', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.ownerId, ownerId))
      .orderBy(desc(transactions.transactionDate), desc(transactions.id));

    return res.json({ transactions: rows });
  } catch (error: any) {
    console.error('List transactions error:', error);
    return res.status(500).json({ error: 'Failed to load financial transactions.' });
  }
});

router.post('/transactions', async (req: AuthRequest, res) => {
  try {
    const parsed = transactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid transaction.' });
    }
    const ownerId = req.admin!.id;
    const data = parsed.data;
    const amountNum = Number(data.amount);

    const [created] = await db
      .insert(transactions)
      .values({
        ownerId,
        type: data.type,
        amount: amountNum.toFixed(2),
        category: data.category,
        transactionDate: data.transactionDate,
        paymentMethod: data.paymentMethod,
        description: data.description,
        reference: data.reference,
        projectId: data.projectId ?? null,
      })
      .returning();

    await logActivity(
      ownerId,
      'created',
      'transaction',
      `Recorded ${created.type} of ৳${Number(created.amount).toLocaleString()} (${created.category})`,
      created.id
    );
    return res.status(201).json({ transaction: created });
  } catch (error: any) {
    console.error('Create transaction error:', error);
    return res.status(500).json({ error: 'Failed to record transaction.' });
  }
});

router.put('/transactions/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid transaction ID.' });
    const parsed = transactionSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid transaction update.' });
    }
    const ownerId = req.admin!.id;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const d = parsed.data;
    if (d.type !== undefined) updates.type = d.type;
    if (d.amount !== undefined) updates.amount = Number(d.amount).toFixed(2);
    if (d.category !== undefined) updates.category = d.category;
    if (d.transactionDate !== undefined) updates.transactionDate = d.transactionDate;
    if (d.paymentMethod !== undefined) updates.paymentMethod = d.paymentMethod;
    if (d.description !== undefined) updates.description = d.description;
    if (d.reference !== undefined) updates.reference = d.reference;
    if (d.projectId !== undefined) updates.projectId = d.projectId;

    const [updated] = await db
      .update(transactions)
      .set(updates)
      .where(and(eq(transactions.id, id), eq(transactions.ownerId, ownerId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Transaction not found.' });

    await logActivity(
      ownerId,
      'updated',
      'transaction',
      `Updated ${updated.type} transaction (${updated.category})`,
      updated.id
    );
    return res.json({ transaction: updated });
  } catch (error: any) {
    console.error('Update transaction error:', error);
    return res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

router.delete('/transactions/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid transaction ID.' });
    const ownerId = req.admin!.id;
    const [deleted] = await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.ownerId, ownerId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Transaction not found.' });

    await logActivity(
      ownerId,
      'deleted',
      'transaction',
      `Deleted ${deleted.type} transaction (${deleted.category})`,
      deleted.id
    );
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete transaction error:', error);
    return res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

// ===================== FILE & DOCUMENT MANAGER =====================
router.get('/files', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const rows = await db
      .select({
        id: files.id,
        originalName: files.originalName,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        folder: files.folder,
        description: files.description,
        projectId: files.projectId,
        taskId: files.taskId,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(eq(files.ownerId, ownerId))
      .orderBy(desc(files.createdAt));

    return res.json({ files: rows });
  } catch (error: any) {
    console.error('List files error:', error);
    return res.status(500).json({ error: 'Failed to load documents.' });
  }
});

router.post('/files', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please select a file to upload.' });
    }
    const ownerId = req.admin!.id;
    const folder = String(req.body.folder || 'General').trim().slice(0, 80) || 'General';
    const description = String(req.body.description || '').trim().slice(0, 500);
    const projectId = req.body.projectId ? parseId(String(req.body.projectId)) : null;
    const taskId = req.body.taskId ? parseId(String(req.body.taskId)) : null;

    const cleanName = sanitizeFilename(file.originalname);
    const fileData = file.buffer.toString('base64');

    const [created] = await db
      .insert(files)
      .values({
        ownerId,
        originalName: cleanName,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        folder,
        description,
        projectId,
        taskId,
        fileData,
      })
      .returning({
        id: files.id,
        originalName: files.originalName,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        folder: files.folder,
        description: files.description,
        projectId: files.projectId,
        taskId: files.taskId,
        createdAt: files.createdAt,
      });

    await logActivity(ownerId, 'uploaded', 'file', `Uploaded document "${created.originalName}"`, created.id);
    return res.status(201).json({ file: created });
  } catch (error: any) {
    console.error('Upload file error:', error);
    return res.status(500).json({ error: error.message || 'Failed to upload document.' });
  }
});

router.get('/files/:id/download', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid file ID.' });
    const ownerId = req.admin!.id;

    const [fileRow] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.ownerId, ownerId)))
      .limit(1);
    if (!fileRow) return res.status(404).json({ error: 'Document not found.' });

    const buffer = Buffer.from(fileRow.fileData, 'base64');
    const safeName = sanitizeFilename(fileRow.originalName);

    res.setHeader('Content-Type', fileRow.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(buffer.length));
    return res.send(buffer);
  } catch (error: any) {
    console.error('Download file error:', error);
    return res.status(500).json({ error: 'Failed to download document.' });
  }
});

router.delete('/files/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid file ID.' });
    const ownerId = req.admin!.id;

    const [deleted] = await db
      .delete(files)
      .where(and(eq(files.id, id), eq(files.ownerId, ownerId)))
      .returning({ id: files.id, originalName: files.originalName });
    if (!deleted) return res.status(404).json({ error: 'Document not found.' });

    await logActivity(ownerId, 'deleted', 'file', `Deleted document "${deleted.originalName}"`, deleted.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete file error:', error);
    return res.status(500).json({ error: 'Failed to delete document.' });
  }
});

// ===================== REPORTS & ANALYTICS =====================
router.get('/reports', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();

    const [allTasks, allProjects, allTx] = await Promise.all([
      db.select().from(tasks).where(eq(tasks.ownerId, ownerId)),
      db.select().from(projects).where(eq(projects.ownerId, ownerId)),
      db.select().from(transactions).where(eq(transactions.ownerId, ownerId)),
    ]);

    const inRange = (dateStr: string | null | undefined) => {
      if (!dateStr) return true;
      if (from && dateStr < from) return false;
      if (to && dateStr > to) return false;
      return true;
    };

    const filteredTasks = allTasks.filter((t) =>
      inRange(t.deadline || new Date(t.createdAt).toISOString().slice(0, 10))
    );
    const filteredTx = allTx.filter((t) => inRange(t.transactionDate));

    // Task status breakdown
    const taskStatusCounts = ['To Do', 'In Progress', 'Completed', 'On Hold'].map((status) => ({
      status,
      count: filteredTasks.filter((t) => t.status === status).length,
    }));

    const taskPriorityCounts = ['Low', 'Medium', 'High', 'Urgent'].map((priority) => ({
      priority,
      count: filteredTasks.filter((t) => t.priority === priority).length,
    }));

    // Monthly task completion
    const monthlyTasksMap = new Map<string, { month: string; completed: number; total: number }>();
    for (const t of filteredTasks) {
      const m = (t.deadline || new Date(t.createdAt).toISOString().slice(0, 10)).slice(0, 7);
      const cur = monthlyTasksMap.get(m) || { month: m, completed: 0, total: 0 };
      cur.total += 1;
      if (t.status === 'Completed') cur.completed += 1;
      monthlyTasksMap.set(m, cur);
    }
    const monthlyTaskReport = Array.from(monthlyTasksMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    // Project progress report
    const projectReport = allProjects.map((p) => {
      const pTasks = allTasks.filter((t) => t.projectId === p.id);
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        priority: p.priority,
        progress: p.progress,
        budget: Number(p.budget || 0),
        totalTasks: pTasks.length,
        completedTasks: pTasks.filter((t) => t.status === 'Completed').length,
        deadline: p.deadline,
      };
    });

    // Finance by month & category
    const financeByMonthMap = new Map<string, { month: string; income: number; expense: number }>();
    const expenseByCategoryMap = new Map<string, number>();
    const incomeByCategoryMap = new Map<string, number>();

    let totalIncome = 0;
    let totalExpense = 0;
    for (const tx of filteredTx) {
      const amt = Number(tx.amount || 0);
      const m = tx.transactionDate.slice(0, 7);
      const entry = financeByMonthMap.get(m) || { month: m, income: 0, expense: 0 };
      if (tx.type === 'income') {
        entry.income += amt;
        totalIncome += amt;
        incomeByCategoryMap.set(tx.category, (incomeByCategoryMap.get(tx.category) || 0) + amt);
      } else {
        entry.expense += amt;
        totalExpense += amt;
        expenseByCategoryMap.set(tx.category, (expenseByCategoryMap.get(tx.category) || 0) + amt);
      }
      financeByMonthMap.set(m, entry);
    }

    const totalTasks = filteredTasks.length;
    const completedTasks = filteredTasks.filter((t) => t.status === 'Completed').length;

    return res.json({
      summary: {
        totalTasks,
        completedTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        totalProjects: allProjects.length,
        avgProjectProgress:
          allProjects.length > 0
            ? Math.round(allProjects.reduce((s, p) => s + p.progress, 0) / allProjects.length)
            : 0,
        totalIncome,
        totalExpense,
        netBalance: totalIncome - totalExpense,
      },
      taskStatusCounts,
      taskPriorityCounts,
      monthlyTaskReport,
      projectReport,
      financeByMonth: Array.from(financeByMonthMap.values()).sort((a, b) =>
        a.month.localeCompare(b.month)
      ),
      expenseByCategory: Array.from(expenseByCategoryMap.entries()).map(([category, amount]) => ({
        category,
        amount,
      })),
      incomeByCategory: Array.from(incomeByCategoryMap.entries()).map(([category, amount]) => ({
        category,
        amount,
      })),
    });
  } catch (error: any) {
    console.error('Reports error:', error);
    return res.status(500).json({ error: 'Failed to generate analytics report.' });
  }
});

// ===================== ACTIVITY LOGS & NOTIFICATIONS & BACKUP =====================
router.get('/activity-logs', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const entityType = String(req.query.entityType || '').trim();
    const limit = Math.min(200, Math.max(10, Number(req.query.limit || 100) || 100));

    const whereCond = entityType
      ? and(eq(activityLogs.ownerId, ownerId), eq(activityLogs.entityType, entityType))
      : eq(activityLogs.ownerId, ownerId);

    const rows = await db
      .select()
      .from(activityLogs)
      .where(whereCond)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);

    return res.json({ logs: rows });
  } catch (error: any) {
    console.error('List activity logs error:', error);
    return res.status(500).json({ error: 'Failed to load activity history.' });
  }
});

router.get('/notifications', async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.ownerId, req.admin!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(40);
    return res.json({ notifications: rows });
  } catch (error: any) {
    console.error('List notifications error:', error);
    return res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

router.patch('/notifications/:id/read', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid notification ID.' });
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.ownerId, req.admin!.id)));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
});

router.post('/notifications/read-all', async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.ownerId, req.admin!.id));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update notifications.' });
  }
});

router.get('/backup/export', async (req: AuthRequest, res) => {
  try {
    const backup = await exportFullBackup(req.admin!.id);
    await logActivity(req.admin!.id, 'updated', 'system', 'Exported full workspace JSON backup');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="poms-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    return res.send(JSON.stringify(backup, null, 2));
  } catch (error: any) {
    console.error('Backup export error:', error);
    return res.status(500).json({ error: error.message || 'Failed to export backup.' });
  }
});

export default router;
