import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  activityLogs,
  calendarEvents,
  files,
  noteCategories,
  notes,
  projects,
  tasks,
  transactions,
} from '../db/schema.ts';
import { logActivity } from '../db/repository.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';

const router = Router();
router.use(requireAuth);

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthPrefix(): string {
  return todayIso().slice(0, 7); // YYYY-MM
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function recalculateProjectProgress(ownerId: number, projectId: number | null) {
  if (!projectId) return;
  try {
    const projectTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.ownerId, ownerId), eq(tasks.projectId, projectId)));
    if (projectTasks.length === 0) return;
    const completedCount = projectTasks.filter((t) => t.status === 'Completed').length;
    const progress = Math.round((completedCount / projectTasks.length) * 100);
    await db
      .update(projects)
      .set({ progress, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)));
  } catch (error) {
    console.error('Failed to recalculate project progress:', error);
  }
}

// ===================== DASHBOARD SUMMARY =====================
router.get('/dashboard/summary', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const today = todayIso();
    const curMonth = monthPrefix();

    const [
      allTasks,
      allProjects,
      allNotes,
      allTransactions,
      allEvents,
      recentActivities,
    ] = await Promise.all([
      db.select().from(tasks).where(eq(tasks.ownerId, ownerId)),
      db.select().from(projects).where(eq(projects.ownerId, ownerId)),
      db.select().from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.isArchived, false))),
      db.select().from(transactions).where(eq(transactions.ownerId, ownerId)),
      db.select().from(calendarEvents).where(eq(calendarEvents.ownerId, ownerId)),
      db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.ownerId, ownerId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(12),
    ]);

    const todayTasks = allTasks.filter(
      (t) => t.deadline === today || t.startDate === today
    );
    const completedTasks = allTasks.filter((t) => t.status === 'Completed');
    const pendingTasks = allTasks.filter((t) => t.status !== 'Completed');
    const overdueTasks = allTasks.filter(
      (t) => t.status !== 'Completed' && t.deadline && t.deadline < today
    );
    const activeProjects = allProjects.filter(
      (p) => p.status === 'Active' || p.status === 'Planning'
    );

    const monthTransactions = allTransactions.filter((t) =>
      t.transactionDate.startsWith(curMonth)
    );
    const monthlyIncome = monthTransactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const monthlyExpenses = monthTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    // Daily productivity percentage based on today's tasks + today's planner schedule
    const todaySchedule = allEvents.filter((e) => e.eventDate === today);
    const todayTotalItems = todayTasks.length + todaySchedule.length;
    const todayCompletedItems =
      todayTasks.filter((t) => t.status === 'Completed').length +
      todaySchedule.filter((e) => e.isCompleted).length;
    const dailyProductivity =
      todayTotalItems > 0
        ? Math.round((todayCompletedItems / todayTotalItems) * 100)
        : allTasks.length > 0
          ? Math.round((completedTasks.length / allTasks.length) * 100)
          : 0;

    // 7-day productivity chart
    const productivitySeries: Array<{
      date: string;
      label: string;
      completed: number;
      created: number;
    }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const completedOnDay = allTasks.filter(
        (t) =>
          t.completedAt &&
          new Date(t.completedAt).toISOString().slice(0, 10) === iso
      ).length;
      const createdOnDay = allTasks.filter(
        (t) => new Date(t.createdAt).toISOString().slice(0, 10) === iso
      ).length;
      productivitySeries.push({
        date: iso,
        label,
        completed: completedOnDay,
        created: createdOnDay,
      });
    }

    // 6-month finance chart
    const financeSeries: Array<{
      month: string;
      label: string;
      income: number;
      expense: number;
    }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const inc = allTransactions
        .filter((t) => t.type === 'income' && t.transactionDate.startsWith(ym))
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      const exp = allTransactions
        .filter((t) => t.type === 'expense' && t.transactionDate.startsWith(ym))
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      financeSeries.push({ month: ym, label, income: inc, expense: exp });
    }

    // Upcoming deadlines (next 14 days, uncompleted tasks + active project deadlines + upcoming events)
    const in14Days = new Date();
    in14Days.setDate(in14Days.getDate() + 14);
    const maxIso = `${in14Days.getFullYear()}-${String(in14Days.getMonth() + 1).padStart(2, '0')}-${String(in14Days.getDate()).padStart(2, '0')}`;

    const upcomingDeadlines = [
      ...pendingTasks
        .filter((t) => t.deadline && t.deadline <= maxIso)
        .map((t) => ({
          id: `task-${t.id}`,
          title: t.title,
          date: t.deadline!,
          type: 'Task' as const,
          priority: t.priority,
          isOverdue: t.deadline! < today,
        })),
      ...activeProjects
        .filter((p) => p.deadline && p.deadline <= maxIso)
        .map((p) => ({
          id: `project-${p.id}`,
          title: p.name,
          date: p.deadline!,
          type: 'Project' as const,
          priority: p.priority,
          isOverdue: p.deadline! < today,
        })),
      ...allEvents
        .filter((e) => !e.isCompleted && e.eventDate >= today && e.eventDate <= maxIso)
        .map((e) => ({
          id: `event-${e.id}`,
          title: e.title,
          date: e.eventDate,
          type: 'Schedule' as const,
          priority: e.startTime,
          isOverdue: false,
        })),
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);

    return res.json({
      stats: {
        todayTasksCount: todayTasks.length,
        totalTasksCount: allTasks.length,
        completedTasksCount: completedTasks.length,
        pendingTasksCount: pendingTasks.length,
        overdueTasksCount: overdueTasks.length,
        activeProjectsCount: activeProjects.length,
        totalNotesCount: allNotes.length,
        monthlyIncome,
        monthlyExpenses,
        dailyProductivity,
      },
      productivitySeries,
      financeSeries,
      recentActivities,
      upcomingDeadlines,
    });
  } catch (error: any) {
    console.error('Dashboard summary error:', error);
    return res.status(500).json({ error: error.message || 'Failed to load dashboard summary.' });
  }
});

// ===================== TASKS =====================
const taskSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(200),
  description: z.string().max(5000).optional().default(''),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional().default('Medium'),
  status: z.enum(['To Do', 'In Progress', 'Completed', 'On Hold']).optional().default('To Do'),
  startDate: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  category: z.string().trim().max(80).optional().default('General'),
  projectId: z.number().int().positive().nullable().optional(),
  attachments: z
    .array(z.object({ fileId: z.number().optional(), name: z.string(), size: z.number().optional() }))
    .optional(),
  position: z.number().int().optional(),
});

router.get('/tasks', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.ownerId, ownerId))
      .orderBy(tasks.position, desc(tasks.createdAt));
    return res.json({ tasks: rows });
  } catch (error: any) {
    console.error('List tasks error:', error);
    return res.status(500).json({ error: 'Failed to load tasks.' });
  }
});

router.post('/tasks', async (req: AuthRequest, res) => {
  try {
    const parsed = taskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid task.' });
    }
    const ownerId = req.admin!.id;
    const data = parsed.data;
    const [created] = await db
      .insert(tasks)
      .values({
        ownerId,
        title: data.title,
        description: data.description || '',
        priority: data.priority,
        status: data.status,
        startDate: data.startDate || null,
        deadline: data.deadline || null,
        category: data.category || 'General',
        projectId: data.projectId ?? null,
        attachments: data.attachments || [],
        position: data.position ?? 0,
        completedAt: data.status === 'Completed' ? new Date() : null,
      })
      .returning();

    if (created.projectId) {
      await recalculateProjectProgress(ownerId, created.projectId);
    }
    await logActivity(ownerId, 'created', 'task', `Created task "${created.title}"`, created.id);
    return res.status(201).json({ task: created });
  } catch (error: any) {
    console.error('Create task error:', error);
    return res.status(500).json({ error: 'Failed to create task.' });
  }
});

router.put('/tasks/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid task ID.' });
    const parsed = taskSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid task update.' });
    }

    const ownerId = req.admin!.id;
    const [existing] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Task not found.' });

    const data = parsed.data;
    const nextStatus = data.status ?? existing.status;
    const completedAt =
      nextStatus === 'Completed'
        ? existing.completedAt || new Date()
        : null;

    const [updated] = await db
      .update(tasks)
      .set({
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.deadline !== undefined && { deadline: data.deadline }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.projectId !== undefined && { projectId: data.projectId }),
        ...(data.attachments !== undefined && { attachments: data.attachments }),
        ...(data.position !== undefined && { position: data.position }),
        completedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .returning();

    if (existing.projectId) await recalculateProjectProgress(ownerId, existing.projectId);
    if (updated.projectId && updated.projectId !== existing.projectId) {
      await recalculateProjectProgress(ownerId, updated.projectId);
    }

    const action =
      existing.status !== 'Completed' && updated.status === 'Completed'
        ? 'completed'
        : 'updated';
    await logActivity(
      ownerId,
      action,
      'task',
      action === 'completed'
        ? `Completed task "${updated.title}"`
        : `Updated task "${updated.title}"`,
      updated.id
    );

    return res.json({ task: updated });
  } catch (error: any) {
    console.error('Update task error:', error);
    return res.status(500).json({ error: 'Failed to update task.' });
  }
});

router.patch('/tasks/:id/status', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid task ID.' });
    const statusSchema = z.object({
      status: z.enum(['To Do', 'In Progress', 'Completed', 'On Hold']),
      position: z.number().int().optional(),
    });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const ownerId = req.admin!.id;
    const [existing] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Task not found.' });

    const [updated] = await db
      .update(tasks)
      .set({
        status: parsed.data.status,
        ...(parsed.data.position !== undefined && { position: parsed.data.position }),
        completedAt: parsed.data.status === 'Completed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .returning();

    if (updated.projectId) await recalculateProjectProgress(ownerId, updated.projectId);
    await logActivity(
      ownerId,
      parsed.data.status === 'Completed' ? 'completed' : 'updated',
      'task',
      `Moved task "${updated.title}" to ${updated.status}`,
      updated.id
    );
    return res.json({ task: updated });
  } catch (error: any) {
    console.error('Patch task status error:', error);
    return res.status(500).json({ error: 'Failed to update task status.' });
  }
});

router.delete('/tasks/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid task ID.' });
    const ownerId = req.admin!.id;
    const [deleted] = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Task not found.' });

    if (deleted.projectId) await recalculateProjectProgress(ownerId, deleted.projectId);
    await logActivity(ownerId, 'deleted', 'task', `Deleted task "${deleted.title}"`, deleted.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete task error:', error);
    return res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// ===================== PROJECTS =====================
const projectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(160),
  description: z.string().max(5000).optional().default(''),
  status: z.enum(['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled']).optional().default('Active'),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional().default('Medium'),
  progress: z.number().int().min(0).max(100).optional().default(0),
  budget: z.union([z.number(), z.string()]).optional().default('0'),
  startDate: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
});

router.get('/projects', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const [projectRows, taskRows, noteRows] = await Promise.all([
      db.select().from(projects).where(eq(projects.ownerId, ownerId)).orderBy(desc(projects.createdAt)),
      db.select().from(tasks).where(eq(tasks.ownerId, ownerId)),
      db.select().from(notes).where(eq(notes.ownerId, ownerId)),
    ]);

    const enriched = projectRows.map((p) => {
      const pTasks = taskRows.filter((t) => t.projectId === p.id);
      const completedTasks = pTasks.filter((t) => t.status === 'Completed').length;
      const pNotes = noteRows.filter((n) => n.projectId === p.id).length;
      return {
        ...p,
        taskCount: pTasks.length,
        completedTaskCount: completedTasks,
        noteCount: pNotes,
      };
    });

    return res.json({ projects: enriched });
  } catch (error: any) {
    console.error('List projects error:', error);
    return res.status(500).json({ error: 'Failed to load projects.' });
  }
});

router.get('/projects/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid project ID.' });
    const ownerId = req.admin!.id;

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
      .limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const [projectTasks, projectNotes, projectFiles, projectTx] = await Promise.all([
      db.select().from(tasks).where(and(eq(tasks.ownerId, ownerId), eq(tasks.projectId, id))),
      db.select().from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.projectId, id))),
      db
        .select({
          id: files.id,
          originalName: files.originalName,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
          folder: files.folder,
          description: files.description,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(and(eq(files.ownerId, ownerId), eq(files.projectId, id))),
      db
        .select()
        .from(transactions)
        .where(and(eq(transactions.ownerId, ownerId), eq(transactions.projectId, id))),
    ]);

    return res.json({
      project,
      tasks: projectTasks,
      notes: projectNotes,
      files: projectFiles,
      transactions: projectTx,
    });
  } catch (error: any) {
    console.error('Get project detail error:', error);
    return res.status(500).json({ error: 'Failed to load project details.' });
  }
});

router.post('/projects', async (req: AuthRequest, res) => {
  try {
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid project.' });
    }
    const ownerId = req.admin!.id;
    const data = parsed.data;
    const budgetVal = Number(data.budget || 0);
    if (Number.isNaN(budgetVal) || budgetVal < 0) {
      return res.status(400).json({ error: 'Budget must be a non-negative number.' });
    }

    const [created] = await db
      .insert(projects)
      .values({
        ownerId,
        name: data.name,
        description: data.description || '',
        status: data.status,
        priority: data.priority,
        progress: data.progress,
        budget: budgetVal.toFixed(2),
        startDate: data.startDate || null,
        deadline: data.deadline || null,
      })
      .returning();

    await logActivity(ownerId, 'created', 'project', `Created project "${created.name}"`, created.id);
    return res.status(201).json({ project: created });
  } catch (error: any) {
    console.error('Create project error:', error);
    return res.status(500).json({ error: 'Failed to create project.' });
  }
});

router.put('/projects/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid project ID.' });
    const parsed = projectSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid project update.' });
    }
    const ownerId = req.admin!.id;
    const data = parsed.data;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.status !== undefined) updates.status = data.status;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.progress !== undefined) updates.progress = data.progress;
    if (data.budget !== undefined) updates.budget = Number(data.budget || 0).toFixed(2);
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.deadline !== undefined) updates.deadline = data.deadline;

    const [updated] = await db
      .update(projects)
      .set(updates)
      .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Project not found.' });

    await logActivity(ownerId, 'updated', 'project', `Updated project "${updated.name}"`, updated.id);
    return res.json({ project: updated });
  } catch (error: any) {
    console.error('Update project error:', error);
    return res.status(500).json({ error: 'Failed to update project.' });
  }
});

router.delete('/projects/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid project ID.' });
    const ownerId = req.admin!.id;
    const [deleted] = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Project not found.' });

    await logActivity(ownerId, 'deleted', 'project', `Deleted project "${deleted.name}"`, deleted.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete project error:', error);
    return res.status(500).json({ error: 'Failed to delete project.' });
  }
});

// ===================== PLANNER & CALENDAR EVENTS =====================
const eventSchema = z.object({
  title: z.string().trim().min(1, 'Event title is required').max(180),
  description: z.string().max(2000).optional().default(''),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be HH:mm').optional().default('09:00'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be HH:mm').optional().default('10:00'),
  category: z.string().trim().max(60).optional().default('Work'),
  eventType: z.enum(['schedule', 'event', 'meeting', 'reminder']).optional().default('schedule'),
  reminderMinutes: z.number().int().min(0).max(10080).nullable().optional().default(15),
  isCompleted: z.boolean().optional().default(false),
  projectId: z.number().int().positive().nullable().optional(),
});

router.get('/events', async (req: AuthRequest, res) => {
  try {
    const ownerId = req.admin!.id;
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.ownerId, ownerId))
      .orderBy(calendarEvents.eventDate, calendarEvents.startTime);
    return res.json({ events: rows });
  } catch (error: any) {
    console.error('List events error:', error);
    return res.status(500).json({ error: 'Failed to load schedule events.' });
  }
});

router.post('/events', async (req: AuthRequest, res) => {
  try {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid event.' });
    }
    const ownerId = req.admin!.id;
    const data = parsed.data;
    const [created] = await db
      .insert(calendarEvents)
      .values({
        ownerId,
        title: data.title,
        description: data.description || '',
        eventDate: data.eventDate,
        startTime: data.startTime,
        endTime: data.endTime,
        category: data.category,
        eventType: data.eventType,
        reminderMinutes: data.reminderMinutes ?? 15,
        isCompleted: data.isCompleted,
        projectId: data.projectId ?? null,
      })
      .returning();

    await logActivity(
      ownerId,
      'created',
      'event',
      `Scheduled "${created.title}" on ${created.eventDate} (${created.startTime}–${created.endTime})`,
      created.id
    );
    return res.status(201).json({ event: created });
  } catch (error: any) {
    console.error('Create event error:', error);
    return res.status(500).json({ error: 'Failed to create event.' });
  }
});

router.put('/events/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid event ID.' });
    const parsed = eventSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid event update.' });
    }
    const ownerId = req.admin!.id;
    const [updated] = await db
      .update(calendarEvents)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.ownerId, ownerId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Event not found.' });

    await logActivity(ownerId, 'updated', 'event', `Updated schedule item "${updated.title}"`, updated.id);
    return res.json({ event: updated });
  } catch (error: any) {
    console.error('Update event error:', error);
    return res.status(500).json({ error: 'Failed to update event.' });
  }
});

router.patch('/events/:id/toggle', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid event ID.' });
    const ownerId = req.admin!.id;
    const [existing] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.ownerId, ownerId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Event not found.' });

    const [updated] = await db
      .update(calendarEvents)
      .set({ isCompleted: !existing.isCompleted, updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.ownerId, ownerId)))
      .returning();

    await logActivity(
      ownerId,
      updated.isCompleted ? 'completed' : 'updated',
      'event',
      `${updated.isCompleted ? 'Completed' : 'Reopened'} scheduled activity "${updated.title}"`,
      updated.id
    );
    return res.json({ event: updated });
  } catch (error: any) {
    console.error('Toggle event error:', error);
    return res.status(500).json({ error: 'Failed to update event status.' });
  }
});

router.delete('/events/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid event ID.' });
    const ownerId = req.admin!.id;
    const [deleted] = await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.ownerId, ownerId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Event not found.' });

    await logActivity(ownerId, 'deleted', 'event', `Deleted event "${deleted.title}"`, deleted.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete event error:', error);
    return res.status(500).json({ error: 'Failed to delete event.' });
  }
});

// ===================== NOTES & CATEGORIES =====================
const noteCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  folder: z.string().trim().min(1).max(80).optional().default('General'),
  color: z.string().trim().max(20).optional().default('#2563EB'),
});

const noteSchema = z.object({
  title: z.string().trim().min(1, 'Note title is required').max(200),
  content: z.string().max(100_000).optional().default(''),
  folder: z.string().trim().max(80).optional().default('General'),
  categoryId: z.number().int().positive().nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional().default([]),
  isPinned: z.boolean().optional().default(false),
  isFavorite: z.boolean().optional().default(false),
  isArchived: z.boolean().optional().default(false),
});

router.get('/note-categories', async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(noteCategories)
      .where(eq(noteCategories.ownerId, req.admin!.id))
      .orderBy(noteCategories.name);
    return res.json({ categories: rows });
  } catch (error: any) {
    console.error('List note categories error:', error);
    return res.status(500).json({ error: 'Failed to load note categories.' });
  }
});

router.post('/note-categories', async (req: AuthRequest, res) => {
  try {
    const parsed = noteCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid category.' });
    }
    const [created] = await db
      .insert(noteCategories)
      .values({ ownerId: req.admin!.id, ...parsed.data })
      .returning();
    return res.status(201).json({ category: created });
  } catch (error: any) {
    console.error('Create note category error:', error);
    return res.status(500).json({ error: 'Failed to create note category.' });
  }
});

router.delete('/note-categories/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid category ID.' });
    await db
      .delete(noteCategories)
      .where(and(eq(noteCategories.id, id), eq(noteCategories.ownerId, req.admin!.id)));
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete note category error:', error);
    return res.status(500).json({ error: 'Failed to delete note category.' });
  }
});

router.get('/notes', async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(notes)
      .where(eq(notes.ownerId, req.admin!.id))
      .orderBy(desc(notes.isPinned), desc(notes.updatedAt));
    return res.json({ notes: rows });
  } catch (error: any) {
    console.error('List notes error:', error);
    return res.status(500).json({ error: 'Failed to load notes.' });
  }
});

router.post('/notes', async (req: AuthRequest, res) => {
  try {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid note.' });
    }
    const ownerId = req.admin!.id;
    const [created] = await db
      .insert(notes)
      .values({
        ownerId,
        title: parsed.data.title,
        content: parsed.data.content,
        folder: parsed.data.folder,
        categoryId: parsed.data.categoryId ?? null,
        projectId: parsed.data.projectId ?? null,
        tags: parsed.data.tags,
        isPinned: parsed.data.isPinned,
        isFavorite: parsed.data.isFavorite,
        isArchived: parsed.data.isArchived,
      })
      .returning();

    await logActivity(ownerId, 'created', 'note', `Created note "${created.title}"`, created.id);
    return res.status(201).json({ note: created });
  } catch (error: any) {
    console.error('Create note error:', error);
    return res.status(500).json({ error: 'Failed to create note.' });
  }
});

router.put('/notes/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid note ID.' });
    const parsed = noteSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid note update.' });
    }
    const ownerId = req.admin!.id;
    const [updated] = await db
      .update(notes)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(notes.id, id), eq(notes.ownerId, ownerId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Note not found.' });

    if (req.query.autosave !== '1') {
      await logActivity(ownerId, 'updated', 'note', `Updated note "${updated.title}"`, updated.id);
    }
    return res.json({ note: updated });
  } catch (error: any) {
    console.error('Update note error:', error);
    return res.status(500).json({ error: 'Failed to update note.' });
  }
});

router.delete('/notes/:id', async (req: AuthRequest, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid note ID.' });
    const ownerId = req.admin!.id;
    const [deleted] = await db
      .delete(notes)
      .where(and(eq(notes.id, id), eq(notes.ownerId, ownerId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Note not found.' });

    await logActivity(ownerId, 'deleted', 'note', `Deleted note "${deleted.title}"`, deleted.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete note error:', error);
    return res.status(500).json({ error: 'Failed to delete note.' });
  }
});

export default router;
