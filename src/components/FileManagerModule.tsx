import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  File,
  FileText,
  FolderOpen,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiDownload, apiFetch } from '../lib/api';
import { formatDateTime, formatFileSize } from '../lib/utils';
import type { AdminProfile, FileItem, ProjectItem, TaskItem } from '../types/poms';
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

interface FileManagerModuleProps {
  admin: AdminProfile;
}

export function FileManagerModule({ admin: _admin }: FileManagerModuleProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);
  const [folder, setFolder] = useState('General');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [uploading, setUploading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [fRes, pRes, tRes] = await Promise.all([
          apiFetch<{ files: FileItem[] }>('/api/files'),
          apiFetch<{ projects: ProjectItem[] }>('/api/projects'),
          apiFetch<{ tasks: TaskItem[] }>('/api/tasks'),
        ]);
        setFiles(fRes.files);
        setProjects(pRes.projects);
        setTasks(tRes.tasks);
      } catch (err: any) {
        toast.error(err.message || 'Failed to load files.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const folders = useMemo(() => {
    const set = new Set<string>(['General', 'Contracts', 'Invoices', 'Reports']);
    files.forEach((f) => f.folder && set.add(f.folder));
    return Array.from(set).sort();
  }, [files]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please choose a document to upload.');
      return;
    }
    if (selectedFile.size > 8 * 1024 * 1024) {
      toast.error('File exceeds the 8 MB maximum limit.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('folder', folder.trim() || 'General');
      fd.append('description', description);
      if (projectId) fd.append('projectId', projectId);
      if (taskId) fd.append('taskId', taskId);

      const res = await apiFetch<{ file: FileItem }>('/api/files', {
        method: 'POST',
        body: fd,
      });
      setFiles((prev) => [res.file, ...prev]);
      setUploadOpen(false);
      setSelectedFile(null);
      setDescription('');
      setProjectId('');
      setTaskId('');
      toast.success(`Uploaded "${res.file.originalName}".`);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      await apiDownload(`/api/files/${file.id}/download`, file.originalName);
      toast.success(`Downloading "${file.originalName}".`);
    } catch (err: any) {
      toast.error(err.message || 'Download failed.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/files/${deleteTarget.id}`, { method: 'DELETE' });
      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      toast.success('Document deleted.');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete document.');
    }
  };

  const filtered = files.filter((f) => {
    if (folderFilter !== 'all' && f.folder !== folderFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        f.originalName.toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q) ||
        f.folder.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalBytes = files.reduce((s, f) => s + (f.sizeBytes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">File Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
            {files.length} documents stored securely · {formatFileSize(totalBytes)} total
          </p>
        </div>

        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files by name, description, or folder..."
            className="pl-9"
          />
        </div>
        <Select
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
          className="w-auto min-w-[160px]"
        >
          <option value="all">All Folders</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Skeleton className="h-56" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No documents found"
          description="Upload contracts, PDFs, spreadsheets, or reference documents and link them to projects or tasks."
          actionLabel="Upload First Document"
          onAction={() => setUploadOpen(true)}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                <th className="py-3 pl-4 pr-3">Document</th>
                <th className="py-3 px-3">Folder</th>
                <th className="py-3 px-3">Linked To</th>
                <th className="py-3 px-3 text-right">Size</th>
                <th className="py-3 px-3">Uploaded</th>
                <th className="py-3 pl-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filtered.map((f) => (
                <tr key={f.id} className="hover:bg-muted/40 transition-colors">
                  <td className="py-3 pl-4 pr-3">
                    <div className="flex items-start gap-2.5">
                      {f.mimeType.includes('pdf') || f.mimeType.includes('text') ? (
                        <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate max-w-xs">
                          {f.originalName}
                        </div>
                        {f.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {f.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs text-muted-foreground">{f.folder}</td>
                  <td className="py-3 px-3 text-xs text-muted-foreground">
                    {f.projectId && projectMap.get(f.projectId)
                      ? `Project: ${projectMap.get(f.projectId)}`
                      : f.taskId && taskMap.get(f.taskId)
                        ? `Task: ${taskMap.get(f.taskId)}`
                        : '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {formatFileSize(f.sizeBytes)}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(f.createdAt)}
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(f)}
                        aria-label={`Download ${f.originalName}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(f)}
                        aria-label={`Delete ${f.originalName}`}
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
      )}

      {/* Upload Modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload Document"
        description="Files up to 8 MB are stored securely in your private cloud database."
      >
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <Label>Select File</Label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="block w-full rounded-lg border border-input bg-card p-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground cursor-pointer"
              required
            />
            {selectedFile && (
              <p className="mt-1 text-xs text-muted-foreground font-mono tabular-nums">
                {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="file-folder">Folder</Label>
            <Input
              id="file-folder"
              list="file-folder-list"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            />
            <datalist id="file-folder-list">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="file-project">Associate with Project</Label>
              <Select
                id="file-project"
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
            <div>
              <Label htmlFor="file-task">Associate with Task</Label>
              <Select
                id="file-task"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
              >
                <option value="">None</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="file-desc">Description</Label>
            <Textarea
              id="file-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Document purpose, version, or remarks..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Document"
        description={`Permanently remove "${deleteTarget?.originalName}"?`}
      />
    </div>
  );
}
