import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bold,
  CheckSquare,
  Code,
  Eye,
  FileText,
  Folder,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pin,
  Plus,
  Quote,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import type { AdminProfile, NoteCategoryItem, NoteItem, ProjectItem } from '../types/poms';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  Skeleton,
} from './ui/primitives';

interface NotesModuleProps {
  admin: AdminProfile;
}

// Safe React Markdown renderer (zero dangerouslySetInnerHTML)
function SafeRichTextPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-base font-semibold text-foreground pt-2">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h2 key={i} className="text-lg font-bold text-foreground pt-2">
              {line.slice(2)}
            </h2>
          );
        }
        if (line.startsWith('> ')) {
          return (
            <blockquote
              key={i}
              className="rounded-md bg-muted/70 px-3.5 py-2 italic text-muted-foreground"
            >
              {line.slice(2)}
            </blockquote>
          );
        }
        if (line.startsWith('- [x] ') || line.startsWith('- [ ] ')) {
          const done = line.startsWith('- [x] ');
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="font-mono text-xs text-muted-foreground mt-0.5">
                {done ? '[✓]' : '[ ]'}
              </span>
              <span className={done ? 'line-through text-muted-foreground' : ''}>
                {line.slice(6)}
              </span>
            </div>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex items-start gap-2 pl-2">
              <span className="text-muted-foreground">•</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          return (
            <div key={i} className="pl-2">
              {line}
            </div>
          );
        }
        // Inline bold/italic/code rendering safely
        const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
        return (
          <p key={i}>
            {parts.map((part, idx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <strong key={idx} className="font-semibold">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={idx}>{part.slice(1, -1)}</em>;
              }
              if (part.startsWith('`') && part.endsWith('`')) {
                return (
                  <code
                    key={idx}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                  >
                    {part.slice(1, -1)}
                  </code>
                );
              }
              return <React.Fragment key={idx}>{part}</React.Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function NotesModule({ admin: _admin }: NotesModuleProps) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [categories, setCategories] = useState<NoteCategoryItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | 'pinned' | 'favorites' | 'archived'>('all');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [previewMode, setPreviewMode] = useState(false);

  // Active editor state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [folder, setFolder] = useState('General');
  const [categoryId, setCategoryId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [deleteTarget, setDeleteTarget] = useState<NoteItem | null>(null);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatFolder, setNewCatFolder] = useState('General');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [nRes, cRes, pRes] = await Promise.all([
          apiFetch<{ notes: NoteItem[] }>('/api/notes'),
          apiFetch<{ categories: NoteCategoryItem[] }>('/api/note-categories'),
          apiFetch<{ projects: ProjectItem[] }>('/api/projects'),
        ]);
        setNotes(nRes.notes);
        setCategories(cRes.categories);
        setProjects(pRes.projects);
        if (nRes.notes.length > 0) {
          selectNote(nRes.notes[0]);
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to load notes.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectNote = (note: NoteItem) => {
    dirtyRef.current = false;
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content || '');
    setFolder(note.folder || 'General');
    setCategoryId(note.categoryId ? String(note.categoryId) : '');
    setProjectId(note.projectId ? String(note.projectId) : '');
    setTagsInput((note.tags || []).join(', '));
    setSaveState('idle');
  };

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) || null,
    [notes, selectedId]
  );

  // Debounced auto-save when active note is edited
  useEffect(() => {
    if (!selectedId || !dirtyRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    setSaveState('saving');
    autosaveTimer.current = setTimeout(async () => {
      try {
        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        const res = await apiFetch<{ note: NoteItem }>(`/api/notes/${selectedId}?autosave=1`, {
          method: 'PUT',
          body: JSON.stringify({
            title: title.trim() || 'Untitled Note',
            content,
            folder: folder.trim() || 'General',
            categoryId: categoryId ? Number(categoryId) : null,
            projectId: projectId ? Number(projectId) : null,
            tags,
          }),
        });
        setNotes((prev) => prev.map((n) => (n.id === res.note.id ? res.note : n)));
        dirtyRef.current = false;
        setSaveState('saved');
      } catch {
        setSaveState('idle');
      }
    }, 700);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [title, content, folder, categoryId, projectId, tagsInput, selectedId]);

  const handleCreateNote = async () => {
    try {
      const res = await apiFetch<{ note: NoteItem }>('/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Untitled Note',
          content: '',
          folder: selectedFolder !== 'all' ? selectedFolder : 'General',
        }),
      });
      setNotes((prev) => [res.note, ...prev]);
      selectNote(res.note);
      setPreviewMode(false);
      toast.success('New note created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create note.');
    }
  };

  const toggleNoteFlag = async (
    note: NoteItem,
    field: 'isPinned' | 'isFavorite' | 'isArchived'
  ) => {
    const nextVal = !note[field];
    try {
      const res = await apiFetch<{ note: NoteItem }>(`/api/notes/${note.id}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: nextVal }),
      });
      setNotes((prev) => prev.map((n) => (n.id === res.note.id ? res.note : n)));
      const label =
        field === 'isPinned'
          ? nextVal
            ? 'Pinned note.'
            : 'Unpinned note.'
          : field === 'isFavorite'
            ? nextVal
              ? 'Added to favorites.'
              : 'Removed from favorites.'
            : nextVal
              ? 'Note archived.'
              : 'Note restored from archive.';
      toast.success(label);
    } catch (err: any) {
      toast.error(err.message || 'Unable to update note.');
    }
  };

  const handleDeleteNote = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/notes/${deleteTarget.id}`, { method: 'DELETE' });
      const remaining = notes.filter((n) => n.id !== deleteTarget.id);
      setNotes(remaining);
      if (selectedId === deleteTarget.id) {
        if (remaining.length > 0) selectNote(remaining[0]);
        else setSelectedId(null);
      }
      toast.success('Note deleted.');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete note.');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const res = await apiFetch<{ category: NoteCategoryItem }>('/api/note-categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCatName.trim(),
          folder: newCatFolder.trim() || 'General',
        }),
      });
      setCategories((prev) => [...prev, res.category]);
      setNewCatName('');
      setCatModalOpen(false);
      toast.success('Category created.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create category.');
    }
  };

  const applyFormat = (prefix: string, suffix = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selectedText = content.slice(start, end) || 'text';
    const next = content.slice(0, start) + prefix + selectedText + suffix + content.slice(end);
    dirtyRef.current = true;
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    });
  };

  const folders = useMemo(() => {
    const set = new Set<string>(['General']);
    notes.forEach((n) => n.folder && set.add(n.folder));
    categories.forEach((c) => c.folder && set.add(c.folder));
    return Array.from(set).sort();
  }, [notes, categories]);

  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (filterScope === 'archived') {
          if (!n.isArchived) return false;
        } else {
          if (n.isArchived) return false;
          if (filterScope === 'pinned' && !n.isPinned) return false;
          if (filterScope === 'favorites' && !n.isFavorite) return false;
        }
        if (selectedFolder !== 'all' && n.folder !== selectedFolder) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const inTags = (n.tags || []).some((t) => t.toLowerCase().includes(q));
          return (
            n.title.toLowerCase().includes(q) ||
            (n.content || '').toLowerCase().includes(q) ||
            inTags
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [notes, filterScope, selectedFolder, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Notes</h1>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
            {notes.filter((n) => !n.isArchived).length} active ·{' '}
            {notes.filter((n) => n.isPinned && !n.isArchived).length} pinned · auto-saved to database
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCatModalOpen(true)}>
            <Folder className="h-4 w-4" />
            New Category
          </Button>
          <Button onClick={handleCreateNote}>
            <Plus className="h-4 w-4" />
            New Note
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px] lg:col-span-2" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Notes Navigator */}
          <div className="lg:col-span-4 rounded-xl border border-border bg-card flex flex-col max-h-[720px]">
            <div className="p-3.5 border-b border-border space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Instant search notes & tags..."
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                {(
                  [
                    ['all', 'All'],
                    ['pinned', 'Pinned'],
                    ['favorites', 'Favorites'],
                    ['archived', 'Archived'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilterScope(k)}
                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      filterScope === k
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <Select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                aria-label="Filter by folder"
              >
                <option value="all">All Folders</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    Folder: {f}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {filteredNotes.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No notes found in this view.
                </div>
              ) : (
                filteredNotes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => selectNote(n)}
                    className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                      selectedId === n.id
                        ? 'bg-accent/60'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {n.title || 'Untitled Note'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                        {n.isPinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                        {n.isFavorite && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {n.content || 'Empty note...'}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground font-mono tabular-nums">
                      {n.folder} · {formatDateTime(n.updatedAt)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right Rich Text Editor */}
          <div className="lg:col-span-8 rounded-xl border border-border bg-card flex flex-col min-h-[580px]">
            {!selectedNote ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <EmptyState
                  icon={FileText}
                  title="Select or create a note"
                  description="Capture meeting notes, project specs, SOPs, and ideas with automatic cloud persistence."
                  actionLabel="Create First Note"
                  onAction={handleCreateNote}
                />
              </div>
            ) : (
              <>
                {/* Editor Top Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                  <span className="text-xs text-muted-foreground">
                    {saveState === 'saving'
                      ? 'Saving changes...'
                      : saveState === 'saved'
                        ? 'All changes saved'
                        : `Last updated ${formatDateTime(selectedNote.updatedAt)}`}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant={previewMode ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setPreviewMode((p) => !p)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {previewMode ? 'Edit' : 'Preview'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleNoteFlag(selectedNote, 'isPinned')}
                      aria-label="Pin note"
                      title="Pin note"
                    >
                      <Pin
                        className={`h-4 w-4 ${selectedNote.isPinned ? 'text-primary' : ''}`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleNoteFlag(selectedNote, 'isFavorite')}
                      aria-label="Favorite note"
                      title="Favorite note"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          selectedNote.isFavorite ? 'text-amber-500 fill-amber-500' : ''
                        }`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleNoteFlag(selectedNote, 'isArchived')}
                      aria-label="Archive note"
                      title={selectedNote.isArchived ? 'Unarchive note' : 'Archive note'}
                    >
                      <Archive
                        className={`h-4 w-4 ${selectedNote.isArchived ? 'text-amber-600' : ''}`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(selectedNote)}
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                </div>

                {/* Note Title & Metadata */}
                <div className="px-5 pt-4 pb-3 border-b border-border space-y-3">
                  <input
                    value={title}
                    onChange={(e) => {
                      dirtyRef.current = true;
                      setTitle(e.target.value);
                    }}
                    placeholder="Note title"
                    className="w-full bg-transparent font-display text-xl font-bold text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                    <Input
                      value={folder}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setFolder(e.target.value);
                      }}
                      placeholder="Folder name"
                      aria-label="Folder"
                    />
                    <Select
                      value={categoryId}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setCategoryId(e.target.value);
                      }}
                      aria-label="Category"
                    >
                      <option value="">No Category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={projectId}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setProjectId(e.target.value);
                      }}
                      aria-label="Linked project"
                    >
                      <option value="">No Project Link</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={tagsInput}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setTagsInput(e.target.value);
                      }}
                      placeholder="Tags (comma separated)"
                      aria-label="Tags"
                    />
                  </div>
                </div>

                {/* Rich Text Formatting Toolbar */}
                {!previewMode && (
                  <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2 bg-muted/30">
                    <button
                      type="button"
                      onClick={() => applyFormat('## ')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      title="Heading"
                    >
                      <Heading2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('**', '**')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      title="Bold"
                    >
                      <Bold className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('*', '*')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      title="Italic"
                    >
                      <Italic className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('\n- ')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      title="Bullet List"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('\n1. ')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      title="Numbered List"
                    >
                      <ListOrdered className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('\n- [ ] ')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      title="Checklist"
                    >
                      <CheckSquare className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('\n> ')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      title="Quote"
                    >
                      <Quote className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('`', '`')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      title="Inline Code"
                    >
                      <Code className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Content Area */}
                <div className="flex-1 p-5 overflow-y-auto">
                  {previewMode ? (
                    <SafeRichTextPreview content={content} />
                  ) : (
                    <textarea
                      ref={textareaRef}
                      value={content}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setContent(e.target.value);
                      }}
                      placeholder="Write your notes here... Use toolbar buttons for headings, bold, lists, checklists, and quotes."
                      className="h-full min-h-[360px] w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* New Note Category Modal */}
      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title="New Note Category"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <div>
            <Label htmlFor="nc-name">Category Name</Label>
            <Input
              id="nc-name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Meeting Minutes, SOPs, Ideas..."
              required
            />
          </div>
          <div>
            <Label htmlFor="nc-folder">Folder</Label>
            <Input
              id="nc-folder"
              value={newCatFolder}
              onChange={(e) => setNewCatFolder(e.target.value)}
              placeholder="General"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Category</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteNote}
        title="Delete Note"
        description={`Permanently delete "${deleteTarget?.title}"?`}
      />
    </div>
  );
}
