import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  FolderKanban,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import {
  formatCurrency,
  formatDate,
  getTodayIso,
  priorityTextClass,
  statusTextClass,
} from '../lib/utils';
import type {
  AdminProfile,
  FileItem,
  NoteItem,
  ProjectItem,
  ProjectStatus,
  TaskItem,
  TaskPriority,
  TransactionItem,
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

const PROJECT_STATUSES: ProjectStatus[] = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'];
const PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

interface ProjectsModuleProps {
  admin: AdminProfile;
}

interface ProjectDetailPayload {
  project: ProjectItem;
  tasks: TaskItem[];
  notes: NoteItem[];
  files: FileItem[];
  transactions: TransactionItem[];
}

export function ProjectsModule({ admin }: ProjectsModuleProps) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Detail modal
  const [detail, setDetail] = useState<ProjectDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickNoteTitle, setQuickNoteTitle] = useState('');
  const [quickNoteBody, setQuickNoteBody] = useState('');

  // Form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [progress, setProgress] = useState('0');
  const [budget, setBudget] = useState('0');
  const [startDate, setStartDate] = useState(getTodayIso());
  const [deadline, setDeadline] = useState('');

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ projects: ProjectItem[] }>('/api/projects');
      setProjects(res.projects);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const openDetail = async (p: ProjectItem) => {
    setDetailLoading(true);
    setQuickTaskTitle('');
    setQuickNoteTitle('');
    setQuickNoteBody('');
    try {
      const res = await apiFetch<ProjectDetailPayload>(`/api/projects/${p.id}`);
      setDetail(res);
    } catch (err: any) {
      toast.error(err.message || 'Unable to load project workspace.');
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setStatus('Active');
    setPriority('Medium');
    setProgress('0');
    setBudget('0');
    setStartDate(getTodayIso());
    setDeadline('');
    setModalOpen(true);
  };

  const openEdit = (p: ProjectItem) => {
    setEditing(p);
    setName(p.name);
    setDescription(p.description || '');
    setStatus(p.status);
    setPriority(p.priority);
    setProgress(String(p.progress ?? 0));
    setBudget(String(Number(p.budget || 0)));
    setStartDate(p.startDate || '');
    setDeadline(p.deadline || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Project name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description,
        status,
        priority,
        progress: Math.min(100, Math.max(0, Number(progress || 0))),
        budget: Number(budget || 0),
        startDate: startDate || null,
        deadline: deadline || null,
      };
      if (editing) {
        await apiFetch(`/api/projects/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success('Project updated.');
      } else {
        await apiFetch('/api/projects', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Project created.');
      }
      setModalOpen(false);
      await loadProjects();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      if (detail?.project.id === deleteTarget.id) setDetail(null);
      toast.success('Project deleted.');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete project.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddProjectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !quickTaskTitle.trim()) return;
    try {
      await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: quickTaskTitle.trim(),
          projectId: detail.project.id,
          priority: detail.project.priority,
          status: 'To Do',
        }),
      });
      setQuickTaskTitle('');
      await Promise.all([openDetail(detail.project), loadProjects()]);
      toast.success('Task added to project.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add task.');
    }
  };

  const handleToggleProjectTask = async (task: TaskItem) => {
    if (!detail) return;
    const nextStatus = task.status === 'Completed' ? 'To Do' : 'Completed';
    try {
      await apiFetch(`/api/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await Promise.all([openDetail(detail.project), loadProjects()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update task.');
    }
  };

  const handleAddProjectNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !quickNoteTitle.trim()) return;
    try {
      await apiFetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: quickNoteTitle.trim(),
          content: quickNoteBody,
          folder: detail.project.name,
          projectId: detail.project.id,
        }),
      });
      setQuickNoteTitle('');
      setQuickNoteBody('');
      await Promise.all([openDetail(detail.project), loadProjects()]);
      toast.success('Project note saved.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add project note.');
    }
  };

  const filtered = projects.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
            {projects.length} total · {projects.filter((p) => p.status === 'Active').length} active ·{' '}
            {projects.filter((p) => p.status === 'Completed').length} completed
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-auto min-w-[150px]"
        >
          <option value="all">All Statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create projects to group related tasks, budgets, milestones, files, and project-specific notes."
          actionLabel="Create First Project"
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openDetail(p)}
                    className="text-left text-base font-semibold text-foreground hover:text-primary cursor-pointer"
                  >
                    {p.name}
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  <span className={statusTextClass(p.status)}>{p.status}</span>
                  <span aria-hidden="true"> · </span>
                  <span className={priorityTextClass(p.priority)}>{p.priority} Priority</span>
                </p>

                {p.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {p.description}
                  </p>
                )}
              </div>

              <div className="mt-5 space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Completion</span>
                    <span className="font-mono font-semibold tabular-nums text-foreground">
                      {p.progress}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums text-foreground">
                    {formatCurrency(p.budget, admin.currency)}
                  </span>
                  <span className="tabular-nums">
                    {p.completedTaskCount ?? 0}/{p.taskCount ?? 0} tasks ·{' '}
                    {formatDate(p.deadline, admin.dateFormat)}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => openDetail(p)}
                >
                  Open Project Workspace
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Project Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Project' : 'Create New Project'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="proj-name">Project Name</Label>
            <Input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Office Digital Transformation"
              required
            />
          </div>
          <div>
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objectives, scope, and key deliverables..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="proj-status">Status</Label>
              <Select
                id="proj-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="proj-priority">Priority</Label>
              <Select
                id="proj-priority"
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="proj-budget">Budget ({admin.currency})</Label>
              <Input
                id="proj-budget"
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="proj-progress">Progress (%)</Label>
              <Input
                id="proj-progress"
                type="number"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="proj-start">Start Date</Label>
              <Input
                id="proj-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="proj-deadline">Deadline</Label>
              <Input
                id="proj-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Project Workspace Detail Modal */}
      <Modal
        open={Boolean(detail) || detailLoading}
        onClose={() => setDetail(null)}
        title={detail?.project.name || 'Loading project...'}
        description={
          detail
            ? `${detail.project.status} · ${detail.project.priority} Priority · Budget ${formatCurrency(detail.project.budget, admin.currency)} · ${detail.project.progress}% complete`
            : undefined
        }
        maxWidth="max-w-3xl"
      >
        {detailLoading || !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <div className="space-y-6">
            {detail.project.description && (
              <p className="text-sm text-muted-foreground">{detail.project.description}</p>
            )}

            {/* Project Tasks */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Project Tasks ({detail.tasks.length})
              </h3>
              <form onSubmit={handleAddProjectTask} className="flex gap-2 mb-3">
                <Input
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  placeholder="Add a task to this project..."
                />
                <Button type="submit" size="sm">
                  Add Task
                </Button>
              </form>
              {detail.tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tasks assigned yet.</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {detail.tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleProjectTask(t)}
                        className="flex items-center gap-2.5 text-left cursor-pointer"
                      >
                        {t.status === 'Completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span
                          className={
                            t.status === 'Completed'
                              ? 'line-through text-muted-foreground'
                              : 'text-foreground'
                          }
                        >
                          {t.title}
                        </span>
                      </button>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDate(t.deadline, admin.dateFormat)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Project Notes */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Project Notes ({detail.notes.length})
              </h3>
              <form onSubmit={handleAddProjectNote} className="space-y-2 mb-3">
                <Input
                  value={quickNoteTitle}
                  onChange={(e) => setQuickNoteTitle(e.target.value)}
                  placeholder="Project note title..."
                />
                <div className="flex gap-2">
                  <Input
                    value={quickNoteBody}
                    onChange={(e) => setQuickNoteBody(e.target.value)}
                    placeholder="Key decision, specification, or meeting note..."
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Save Note
                  </Button>
                </div>
              </form>
              {detail.notes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No project notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.notes.map((n) => (
                    <div key={n.id} className="rounded-lg border border-border p-3">
                      <div className="text-sm font-medium text-foreground">{n.title}</div>
                      {n.content && (
                        <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                          {n.content}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Project"
        description={`Delete project "${deleteTarget?.name}"? Linked tasks and notes will remain in your workspace unlinked.`}
        loading={saving}
      />
    </div>
  );
}
