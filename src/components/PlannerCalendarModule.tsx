import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { formatDate, getTodayIso } from '../lib/utils';
import type { AdminProfile, CalendarEventItem, ProjectItem } from '../types/poms';
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

interface PlannerCalendarModuleProps {
  admin: AdminProfile;
  mode: 'planner' | 'calendar';
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function PlannerCalendarModule({ admin, mode }: PlannerCalendarModuleProps) {
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(getTodayIso());
  const [calendarView, setCalendarView] = useState<'daily' | 'weekly' | 'monthly'>(
    mode === 'planner' ? 'daily' : 'monthly'
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEventItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEventItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(getTodayIso());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [category, setCategory] = useState('Work');
  const [eventType, setEventType] = useState<'schedule' | 'event' | 'meeting' | 'reminder'>('schedule');
  const [reminderMinutes, setReminderMinutes] = useState('15');
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    setCalendarView(mode === 'planner' ? 'daily' : 'monthly');
  }, [mode]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [evRes, projRes] = await Promise.all([
          apiFetch<{ events: CalendarEventItem[] }>('/api/events'),
          apiFetch<{ projects: ProjectItem[] }>('/api/projects'),
        ]);
        setEvents(evRes.events);
        setProjects(projRes.projects);
      } catch (err: any) {
        toast.error(err.message || 'Failed to load schedule.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openCreate = (dateForNew = selectedDate) => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setEventDate(dateForNew);
    setStartTime('09:00');
    setEndTime('10:00');
    setCategory('Work');
    setEventType(mode === 'planner' ? 'schedule' : 'event');
    setReminderMinutes('15');
    setProjectId('');
    setModalOpen(true);
  };

  const openEdit = (ev: CalendarEventItem) => {
    setEditing(ev);
    setTitle(ev.title);
    setDescription(ev.description || '');
    setEventDate(ev.eventDate);
    setStartTime(ev.startTime);
    setEndTime(ev.endTime);
    setCategory(ev.category || 'Work');
    setEventType(ev.eventType);
    setReminderMinutes(String(ev.reminderMinutes ?? 15));
    setProjectId(ev.projectId ? String(ev.projectId) : '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Activity title is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description,
        eventDate,
        startTime,
        endTime,
        category: category.trim() || 'Work',
        eventType,
        reminderMinutes: Number(reminderMinutes || 0),
        projectId: projectId ? Number(projectId) : null,
      };
      if (editing) {
        const res = await apiFetch<{ event: CalendarEventItem }>(`/api/events/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setEvents((prev) => prev.map((x) => (x.id === res.event.id ? res.event : x)));
        toast.success('Schedule updated.');
      } else {
        const res = await apiFetch<{ event: CalendarEventItem }>('/api/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setEvents((prev) => [...prev, res.event]);
        toast.success('Activity scheduled.');
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Unable to save activity.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (ev: CalendarEventItem) => {
    setEvents((prev) =>
      prev.map((x) => (x.id === ev.id ? { ...x, isCompleted: !x.isCompleted } : x))
    );
    try {
      const res = await apiFetch<{ event: CalendarEventItem }>(`/api/events/${ev.id}/toggle`, {
        method: 'PATCH',
      });
      setEvents((prev) => prev.map((x) => (x.id === res.event.id ? res.event : x)));
    } catch (err: any) {
      setEvents((prev) => prev.map((x) => (x.id === ev.id ? ev : x)));
      toast.error(err.message || 'Failed to update activity.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/events/${deleteTarget.id}`, { method: 'DELETE' });
      setEvents((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success('Activity removed.');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete activity.');
    } finally {
      setSaving(false);
    }
  };

  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => e.eventDate === selectedDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events, selectedDate]
  );

  const upcomingEvents = useMemo(() => {
    const today = getTodayIso();
    return events
      .filter((e) => e.eventDate >= today && !e.isCompleted)
      .sort((a, b) =>
        a.eventDate === b.eventDate
          ? a.startTime.localeCompare(b.startTime)
          : a.eventDate.localeCompare(b.eventDate)
      )
      .slice(0, 8);
  }, [events]);

  // Weekly dates around selectedDate
  const weekDays = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dayOfWeek = dt.getDay();
    const startOfWeek = addDays(selectedDate, -dayOfWeek);
    return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i));
  }, [selectedDate]);

  // Monthly grid for selectedDate's month
  const monthGrid = useMemo(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<{ iso: string | null; dayNum?: number }> = [];
    for (let i = 0; i < startDay; i++) cells.push({ iso: null });
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({
        iso: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        dayNum: day,
      });
    }
    return {
      monthLabel: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      cells,
    };
  }, [selectedDate]);

  const completedTodayCount = dayEvents.filter((e) => e.isCompleted).length;
  const todayIso = getTodayIso();

  const shiftPeriod = (dir: -1 | 1) => {
    if (calendarView === 'daily') setSelectedDate(addDays(selectedDate, dir));
    else if (calendarView === 'weekly') setSelectedDate(addDays(selectedDate, dir * 7));
    else {
      const [y, m] = selectedDate.split('-').map(Number);
      const next = new Date(y, m - 1 + dir, 1);
      setSelectedDate(
        `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {mode === 'planner' ? 'Daily Planner' : 'Calendar'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
            {dayEvents.length} scheduled for {formatDate(selectedDate, admin.dateFormat)} ·{' '}
            {completedTodayCount} completed
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg bg-muted p-1">
            {(['daily', 'weekly', 'monthly'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setCalendarView(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors cursor-pointer ${
                  calendarView === v
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <Button onClick={() => openCreate(selectedDate)}>
            <Plus className="h-4 w-4" />
            Schedule Activity
          </Button>
        </div>
      </div>

      {/* Navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftPeriod(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedDate(todayIso)}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => shiftPeriod(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-semibold text-foreground">
            {calendarView === 'monthly'
              ? monthGrid.monthLabel
              : formatDate(selectedDate, admin.dateFormat)}
          </span>
        </div>

        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="w-auto"
          aria-label="Jump to date"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            {calendarView === 'daily' && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">
                    Daily Work Schedule · {formatDate(selectedDate, admin.dateFormat)}
                  </h2>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {completedTodayCount}/{dayEvents.length} done
                  </span>
                </div>

                {dayEvents.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="No activities scheduled"
                    description="Plan your focused work blocks, meetings, and reminders for this day."
                    actionLabel="Add Scheduled Activity"
                    onAction={() => openCreate(selectedDate)}
                  />
                ) : (
                  <div className="divide-y divide-border">
                    {dayEvents.map((ev) => (
                      <div key={ev.id} className="flex items-start justify-between gap-4 py-3.5">
                        <div className="flex items-start gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggle(ev)}
                            className="mt-0.5 text-muted-foreground hover:text-primary cursor-pointer"
                            aria-label={`Toggle ${ev.title}`}
                          >
                            {ev.isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-medium ${
                                ev.isCompleted
                                  ? 'line-through text-muted-foreground'
                                  : 'text-foreground'
                              }`}
                            >
                              {ev.title}
                            </p>
                            {ev.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {ev.description}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-mono tabular-nums text-foreground">
                                {ev.startTime} – {ev.endTime}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span>{ev.category}</span>
                              <span aria-hidden="true"> · </span>
                              <span className="capitalize">{ev.eventType}</span>
                              {ev.reminderMinutes ? (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Bell className="h-3 w-3" />
                                    {ev.reminderMinutes}m prior
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(ev)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(ev)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {calendarView === 'weekly' && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                  {weekDays.map((iso) => {
                    const [y, m, d] = iso.split('-').map(Number);
                    const dt = new Date(y, m - 1, d);
                    const items = events
                      .filter((e) => e.eventDate === iso)
                      .sort((a, b) => a.startTime.localeCompare(b.startTime));
                    const isToday = iso === todayIso;
                    return (
                      <div
                        key={iso}
                        className={`rounded-lg border p-2.5 min-h-[220px] ${
                          iso === selectedDate
                            ? 'border-primary bg-accent/30'
                            : 'border-border bg-background/50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedDate(iso)}
                          className="mb-2 flex w-full items-center justify-between text-left cursor-pointer"
                        >
                          <span className="text-xs font-medium text-muted-foreground">
                            {dt.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <span
                            className={`font-mono text-xs tabular-nums font-semibold ${
                              isToday ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            {d}
                          </span>
                        </button>

                        <div className="space-y-1.5">
                          {items.map((ev) => (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => openEdit(ev)}
                              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-left hover:border-primary/60 transition-colors cursor-pointer"
                            >
                              <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                {ev.startTime}
                              </div>
                              <div
                                className={`truncate text-xs font-medium ${
                                  ev.isCompleted
                                    ? 'line-through text-muted-foreground'
                                    : 'text-foreground'
                                }`}
                              >
                                {ev.title}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {calendarView === 'monthly' && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-medium text-muted-foreground">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {monthGrid.cells.map((cell, idx) => {
                    if (!cell.iso) {
                      return <div key={`empty-${idx}`} className="h-24 rounded-lg bg-muted/20" />;
                    }
                    const items = events.filter((e) => e.eventDate === cell.iso);
                    const isSelected = cell.iso === selectedDate;
                    const isToday = cell.iso === todayIso;
                    return (
                      <div
                        key={cell.iso}
                        onClick={() => setSelectedDate(cell.iso!)}
                        className={`h-24 rounded-lg border p-1.5 overflow-hidden transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-accent/30'
                            : 'border-border bg-background/40 hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-mono text-xs tabular-nums ${
                              isToday ? 'font-bold text-primary' : 'text-foreground'
                            }`}
                          >
                            {cell.dayNum}
                          </span>
                          {items.length > 0 && (
                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                              {items.length}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {items.slice(0, 2).map((ev) => (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(ev);
                              }}
                              className="truncate text-[11px] font-medium text-foreground hover:text-primary"
                            >
                              {ev.startTime} {ev.title}
                            </div>
                          ))}
                          {items.length > 2 && (
                            <div className="text-[10px] text-muted-foreground">
                              +{items.length - 2} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Upcoming Events Sidebar */}
          <div className="rounded-xl border border-border bg-card p-5 h-fit">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Upcoming Schedule</h2>
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No upcoming scheduled events.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {upcomingEvents.map((ev) => (
                  <div key={ev.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => openEdit(ev)}
                        className="text-left text-sm font-medium text-foreground hover:text-primary truncate block w-full cursor-pointer"
                      >
                        {ev.title}
                      </button>
                      <p className="mt-0.5 text-xs text-muted-foreground font-mono tabular-nums">
                        {formatDate(ev.eventDate, admin.dateFormat)} · {ev.startTime}–{ev.endTime}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggle(ev)}
                      className="text-muted-foreground hover:text-emerald-600 cursor-pointer shrink-0 mt-0.5"
                      aria-label={`Complete ${ev.title}`}
                    >
                      <Circle className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Scheduled Activity' : 'New Scheduled Activity'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="ev-title">Title</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Client strategy review"
              required
            />
          </div>
          <div>
            <Label htmlFor="ev-desc">Description</Label>
            <Textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda, location, or preparation notes..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="ev-date">Date</Label>
              <Input
                id="ev-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="ev-start">Start Time</Label>
              <Input
                id="ev-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="ev-end">End Time</Label>
              <Input
                id="ev-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="ev-type">Type</Label>
              <Select
                id="ev-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value as any)}
              >
                <option value="schedule">Work Block</option>
                <option value="meeting">Meeting</option>
                <option value="event">Event</option>
                <option value="reminder">Reminder</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="ev-cat">Category</Label>
              <Input
                id="ev-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ev-rem">Reminder (min)</Label>
              <Select
                id="ev-rem"
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(e.target.value)}
              >
                <option value="0">None</option>
                <option value="5">5 min before</option>
                <option value="15">15 min before</option>
                <option value="30">30 min before</option>
                <option value="60">1 hour before</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="ev-project">Related Project (optional)</Label>
            <Select
              id="ev-project"
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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Schedule Activity'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Scheduled Activity"
        description={`Remove "${deleteTarget?.title}" from your calendar?`}
        loading={saving}
      />
    </div>
  );
}
