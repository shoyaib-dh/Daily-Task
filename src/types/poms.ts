export type ModuleKey =
  | 'dashboard'
  | 'tasks'
  | 'planner'
  | 'calendar'
  | 'notes'
  | 'projects'
  | 'data-manager'
  | 'finance'
  | 'files'
  | 'reports'
  | 'activity'
  | 'settings';

export interface AdminProfile {
  id: number;
  username: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  currency: string;
  dateFormat: string;
  theme: 'light' | 'dark';
  notificationsEnabled: boolean;
  hasPassword: boolean;
  hasGoogleLinked: boolean;
  createdAt: string;
}

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskStatus = 'To Do' | 'In Progress' | 'Completed' | 'On Hold';

export interface TaskItem {
  id: number;
  projectId: number | null;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string | null;
  deadline: string | null;
  category: string;
  attachments: Array<{ fileId?: number; name: string; size?: number }>;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = 'Planning' | 'Active' | 'On Hold' | 'Completed' | 'Cancelled';

export interface ProjectItem {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: TaskPriority;
  progress: number;
  budget: string;
  startDate: string | null;
  deadline: string | null;
  taskCount?: number;
  completedTaskCount?: number;
  noteCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventItem {
  id: number;
  projectId: number | null;
  title: string;
  description: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  category: string;
  eventType: 'schedule' | 'event' | 'meeting' | 'reminder';
  reminderMinutes: number | null;
  isCompleted: boolean;
  createdAt: string;
}

export interface NoteCategoryItem {
  id: number;
  name: string;
  folder: string;
  color: string;
}

export interface NoteItem {
  id: number;
  categoryId: number | null;
  projectId: number | null;
  title: string;
  content: string;
  folder: string;
  tags: string[];
  isPinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'email' | 'phone' | 'dropdown';

export interface CustomFieldDef {
  id?: number;
  name: string;
  fieldKey: string;
  fieldType: CustomFieldType;
  options: string[];
  required: boolean;
  sortOrder?: number;
}

export interface DataCategoryItem {
  id: number;
  name: string;
  description: string;
  fields: CustomFieldDef[];
  recordCount: number;
  createdAt: string;
}

export interface CustomRecordItem {
  id: number;
  categoryId: number;
  title: string;
  data: Record<string, string | number | null>;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionItem {
  id: number;
  projectId: number | null;
  type: 'income' | 'expense';
  amount: string;
  category: string;
  transactionDate: string;
  paymentMethod: string;
  description: string;
  reference: string;
  createdAt: string;
}

export interface FileItem {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  folder: string;
  description: string;
  projectId: number | null;
  taskId: number | null;
  createdAt: string;
}

export interface ActivityLogItem {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  summary: string;
  createdAt: string;
}

export interface DashboardSummary {
  stats: {
    todayTasksCount: number;
    totalTasksCount: number;
    completedTasksCount: number;
    pendingTasksCount: number;
    overdueTasksCount: number;
    activeProjectsCount: number;
    totalNotesCount: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    dailyProductivity: number;
  };
  productivitySeries: Array<{
    date: string;
    label: string;
    completed: number;
    created: number;
  }>;
  financeSeries: Array<{
    month: string;
    label: string;
    income: number;
    expense: number;
  }>;
  recentActivities: ActivityLogItem[];
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    date: string;
    type: 'Task' | 'Project' | 'Schedule';
    priority: string;
    isOverdue: boolean;
  }>;
}
