import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Columns3,
  List,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import {
  formatDate,
  getTodayIso,
  priorityTextClass,
  statusTextClass,
} from '../lib/utils';
import type {
  AdminProfile,
  FileItem,
  ProjectItem,
  TaskItem,
  TaskPriority,
  TaskStatus,
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

const STATUSES: TaskStatus[] = ['To Do', 'In Progress', 'Completed', 'On Hold'];
const PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
const PRIORITY_RANK: Record<string, number> = { Urgent: 4, High: 3, Medium: 2, Low: 1 };

interface TasksModuleProps {
  admin: AdminProfile;
}

export function TasksModule({ admin }: TasksModuleProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [timeframe, setTimeframe] = useState<'all' | 'daily' | 'weekly' | 'monthly' | 'overdue'>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'deadline' | 'priority' | 'status' | 'newest'>('deadline');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [status, setStatus] = useState<TaskStatus>('To Do');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('General');
  const [projectId, setProjectId] = useState<string>('');
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [taskRes, projRes, fileRes] = await Promise.all([
        apiFetch<{ tasks: TaskItem[] }>('/api/tasks'),
        apiFetch<{ projects: ProjectItem[] }>('/api/projects'),
        apiFetch<{ files: FileItem[] }>('/api/files'),
      ]);
      setTasks(taskRes.tasks);
      setProjects(projRes.projects);
      setFiles(fileRes.files);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = (defaultStatus: TaskStatus = 'To Do') => {
    setEditingTask(null);
    setTitle('');
    setDescription('');
    setPriority('Medium');
    setStatus(defaultStatus);
    setStartDate(getTodayIso());
    setDeadline(getTodayIso());
    setCategory('General');
    setProjectId('');
    setSelectedFileIds([]);
    setModalOpen(true);
  };

  const openEditModal = (t: TaskItem) => {
    setEditingTask(t);
    setTitle(t.title);
    setDescription(t.description || '');
    setPriority(t.priority);
    setStatus(t.status);
    setStartDate(t.startDate || '');
    setDeadline(t.deadline || '');
    setCategory(t.category || 'General');
    setProjectId(t.projectId ? String(t.projectId) : '');
    setSelectedFileIds(
      (t.attachments || [])
        .map((a) => a.fileId)
        .filter((id): id is number => typeof id === 'number')
    );
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Task title is required.');
      return;
    }
    setSaving(true);
    try {
      const attachments = selectedFileIds
        .map((fid) => files.find((f) => f.id === fid))
        .filter((f): f is FileItem => Boolean(f))
        .map((f) => ({ fileId: f.id, name: f.originalName, size: f.sizeBytes }));

      const payload = {
        title: title.trim(),
        description,
        priority,
        status,
        startDate: startDate || null,
        deadline: deadline || null,
        category: category.trim() || 'General',
        projectId: projectId ? Number(projectId) : null,
        attachments,
      };

      if (editingTask) {
        const res = await apiFetch<{ task: TaskItem }>(`/api/tasks/${editingTask.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setTasks((prev) => prev.map((x) => (x.id === res.task.id ? res.task : x)));
        toast.success('Task updated.');
      } else {
        const res = await apiFetch<{ task: TaskItem }>('/api/tasks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setTasks((prev) => [res.task, ...prev]);
        toast.success('Task created.');
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Unable to save task.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (task: TaskItem, nextStatus: TaskStatus) => {
    if (task.status === nextStatus) return;
    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      const res = await apiFetch<{ task: TaskItem }>(`/api/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setTasks((prev) => prev.map((t) => (t.id === res.task.id ? res.task : t)));
      toast.success(`Moved "${task.title}" to ${nextStatus}.`);
    } catch (err: any) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      toast.error(err.message || 'Failed to update status.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/tasks/${deleteTarget.id}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success('Task deleted.');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete task.');
    } finally {
      setSaving(false);
    }
  };

  const today = getTodayIso();

  const filteredTasks = useMemo(() => {
    const nowDate = new Date();
    const weekEnd = new Date(nowDate);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndIso = weekEnd.toISOString().slice(0, 10);
    const monthPrefix = today.slice(0, 7);

    return tasks
      .filter((t) => {
        if (search.trim()) {
          const q = search.toLowerCase();
          const match =
            t.title.toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            (t.category || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;

        if (timeframe === 'daily') {
          return t.deadline === today || t.startDate === today;
        }
        if (timeframe === 'weekly') {
          return Boolean(t.deadline && t.deadline >= today && t.deadline <= weekEndIso);
        }
        if (timeframe === 'monthly') {
          return Boolean(t.deadline && t.deadline.startsWith(monthPrefix));
        }
        if (timeframe === 'overdue') {
          return t.status !== 'Completed' && Boolean(t.deadline && t.deadline < today);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'priority') {
          return (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
        }
        if (sortBy === 'status') {
          return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
        }
        if (sortBy === 'newest') {
          return b.createdAt.localeCompare(a.createdAt);
        }
        return (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31');
      });
  }, [tasks, search, statusFilter, priorityFilter, timeframe, sortBy, today]);

  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    projects.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [projects]);

  const overdueCount = tasks.filter(
    (t) => t.status !== 'Completed' && t.deadline && t.deadline < today
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
            {tasks.length} total · {tasks.filter((t) => t.status === 'Completed').length} completed ·{' '}
            <span className={overdueCount > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
              {overdueCount} overdue
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Kanban
            </button>
          </div>
          <Button onClick={() => openCreateModal('To Do')}>
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Timeframe Tabs & Search/Filter Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5">
        <div className="flex items-center gap-1 overflow-x-auto bg-muted p-1 rounded-lg">
          {(
            [
              ['all', 'All Tasks'],
              ['daily', 'Today'],
              ['weekly', 'This Week'],
              ['monthly', 'This Month'],
              ['overdue', `Overdue (${overdueCount})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTimeframe(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                timeframe === key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-auto min-w-[130px]"
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-auto min-w-[130px]"
            aria-label="Filter by priority"
          >
            <option value="all">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-auto min-w-[140px]"
            aria-label="Sort tasks"
          >
            <option value="deadline">Sort: Deadline</option>
            <option value="priority">Sort: Priority</option>
            <option value="status">Sort: Status</option>
            <option value="newest">Sort: Newest</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : filteredTasks.length === 0 && viewMode === 'list' ? (
        <EmptyState
          icon={CheckCircle2}
          title="No tasks match your view"
          description="Create a new task with priority, deadline, category, and project assignment to organize your workday."
          actionLabel="Create Task"
          onAction={() => openCreateModal('To Do')}
        />
      ) : viewMode === 'list' ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                <th className="py-3 pl-4 pr-2 w-10">Done</th>
                <th className="py-3 px-3">Task</th>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Category / Project</th>
                <th className="py-3 px-3">Deadline</th>
                <th className="py-3 pl-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filteredTasks.map((t) => {
                const isOverdue = t.status !== 'Completed' && Boolean(t.deadline && t.deadline < today);
                return (
                  <tr
                    key={t.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="py-3 pl-4 pr-2 align-middle">
                      <button
                        type="button"
                        onClick={() =>
                          handleStatusChange(t, t.status === 'Completed' ? 'To Do' : 'Completed')
                        }
                        aria-label={`Toggle completion for ${t.title}`}
                        className="text-muted-foreground hover:text-primary cursor-pointer"
                      >
                        {t.status === 'Completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-3 align-middle max-w-md">
                      <div
                        className={`font-medium ${
                          t.status === 'Completed'
                            ? 'line-through text-muted-foreground'
                            : 'text-foreground'
                        }`}
                      >
                        {t.title}
                      </div>
                      {t.description && (
                        <div className="truncate text-xs text-muted-foreground mt-0.5">
                          {t.description}
                        </div>
                      )}
                      {(t.attachments?.length || 0) > 0 && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" />
                          {t.attachments.length} attachment{t.attachments.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className={`py-3 px-3 align-middle text-xs ${priorityTextClass(t.priority)}`}>
                      {t.priority}
                    </td>
                    <td className="py-3 px-3 align-middle">
                      <select
                        value={t.status}
                        onChange={(e) => handleStatusChange(t, e.target.value as TaskStatus)}
                        className={`bg-transparent text-xs focus:outline-none cursor-pointer ${statusTextClass(t.status)}`}
                        aria-label={`Change status for ${t.title}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s} className="bg-card text-foreground">
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3 align-middle text-xs text-muted-foreground">
                      <span>{t.category || 'General'}</span>
                      {t.projectId && projectMap.get(t.projectId) && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="text-foreground">{projectMap.get(t.projectId)}</span>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-3 align-middle font-mono text-xs tabular-nums">
                      <span
                        className={
                          isOverdue
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-muted-foreground'
                        }
                      >
                        {formatDate(t.deadline, admin.dateFormat)}
                      </span>
                      {isOverdue && (
                        <span className="ml-1.5 text-[11px] font-sans font-medium text-red-600 dark:text-red-400">
                          Overdue
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-3 pr-4 align-middle text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditModal(t)}
                          aria-label={`Edit ${t.title}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(t)}
                          aria-label={`Delete ${t.title}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Drag-and-Drop Kanban Board */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUSES.map((colStatus) => {
            const colTasks = filteredTasks.filter((t) => t.status === colStatus);
            const isDropTarget = dragOverColumn === colStatus;
            return (
              <div
                key={colStatus}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverColumn(colStatus);
                }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverColumn(null);
                  const id = draggedTaskId ?? Number(e.dataTransfer.getData('text/plain'));
                  const dragged = tasks.find((t) => t.id === id);
                  if (dragged) handleStatusChange(dragged, colStatus);
                  setDraggedTaskId(null);
                }}
                className={`flex flex-col rounded-xl border p-3.5 min-h-[420px] transition-colors ${
                  isDropTarget
                    ? 'border-primary bg-accent/40'
                    : 'border-border bg-muted/40'
                }`}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-sm font-semibold ${statusTextClass(colStatus)}`}>
                      {colStatus}
                    </h3>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreateModal(colStatus)}
                    aria-label={`Add task to ${colStatus}`}
                    className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colTasks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                      Drag a task here
                    </div>
                  ) : (
                    colTasks.map((t) => {
                      const isOverdue =
                        t.status !== 'Completed' && Boolean(t.deadline && t.deadline < today);
                      return (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggedTaskId(t.id);
                            e.dataTransfer.setData('text/plain', String(t.id));
                          }}
                          onDragEnd={() => {
                            setDraggedTaskId(null);
                            setDragOverColumn(null);
                          }}
                          className="rounded-lg border border-border bg-card p-3.5 cursor-grab active:cursor-grabbing hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-foreground leading-snug">
                              {t.title}
                            </p>
                            <button
                              type="button"
                              onClick={() => openEditModal(t)}
                              className="shrink-0 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                              aria-label={`Edit ${t.title}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {t.description && (
                            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                              {t.description}
                            </p>
                          )}
                          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span className={priorityTextClass(t.priority)}>{t.priority}</span>
                            <span
                              className={`font-mono tabular-nums ${
                                isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''
                              }`}
                            >
                              {formatDate(t.deadline, admin.dateFormat)}
                            </span>
                          </div>
                          {(t.category || t.projectId) && (
                            <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground truncate">
                              {t.category}
                              {t.projectId && projectMap.get(t.projectId)
                                ? ` · ${projectMap.get(t.projectId)}`
                                : ''}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Task Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Create New Task'}
        description="Assign priority, dates, project linkage, and document attachments."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="task-title">Task Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Prepare Q4 financial summary"
              required
            />
          </div>

          <div>
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add key deliverables, context, or checklist items..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-priority">Priority</Label>
              <Select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="task-status">Status</Label>
              <Select
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-start">Start Date</Label>
              <Input
                id="task-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="task-deadline">Deadline</Label>
              <Input
                id="task-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-category">Category</Label>
              <Input
                id="task-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Operations, Finance, Client..."
              />
            </div>
            <div>
              <Label htmlFor="task-project">Assign to Project</Label>
              <Select
                id="task-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {files.length > 0 && (
            <div>
              <Label>Attach Uploaded Documents</Label>
              <div className="max-h-28 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
                {files.map((f) => {
                  const checked = selectedFileIds.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 text-xs text-foreground cursor-pointer py-1 px-1.5 rounded hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedFileIds((prev) =>
                            checked ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                          )
                        }
                      />
                      <span className="truncate">{f.originalName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingTask ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Task"
        description={`Are you sure you want to permanently delete "${deleteTarget?.title}"?`}
        loading={saving}
      />
    </div>
  );
}
