import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. Admin Users (supports both single-admin bcrypt credentials and Firebase Auth UID)
export const adminUsers = pgTable(
  'admin_users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').unique(),
    username: text('username').notNull().unique(),
    email: text('email'),
    displayName: text('display_name').notNull().default('Shoyaib'),
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    currency: text('currency').notNull().default('BDT'),
    dateFormat: text('date_format').notNull().default('YYYY-MM-DD'),
    theme: text('theme').notNull().default('light'),
    notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('admin_users_username_idx').on(table.username)]
);

// 2. Admin Sessions (server-side expiring sessions, token stored as SHA-256 hash)
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: serial('id').primaryKey(),
    adminId: integer('admin_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('admin_sessions_admin_idx').on(table.adminId),
    index('admin_sessions_expires_idx').on(table.expiresAt),
  ]
);

// 3. Projects
export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description').default(''),
    status: text('status').notNull().default('Active'), // Planning | Active | On Hold | Completed | Cancelled
    priority: text('priority').notNull().default('Medium'), // Low | Medium | High | Urgent
    progress: integer('progress').notNull().default(0),
    budget: numeric('budget', { precision: 14, scale: 2 }).default('0'),
    startDate: text('start_date'), // YYYY-MM-DD
    deadline: text('deadline'), // YYYY-MM-DD
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('projects_owner_idx').on(table.ownerId),
    index('projects_status_idx').on(table.status),
  ]
);

// 4. Tasks
export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description').default(''),
    priority: text('priority').notNull().default('Medium'), // Low | Medium | High | Urgent
    status: text('status').notNull().default('To Do'), // To Do | In Progress | Completed | On Hold
    startDate: text('start_date'), // YYYY-MM-DD
    deadline: text('deadline'), // YYYY-MM-DD
    category: text('category').default('General'),
    attachments: jsonb('attachments')
      .$type<Array<{ fileId?: number; name: string; size?: number }>>()
      .default([]),
    position: integer('position').notNull().default(0),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('tasks_owner_idx').on(table.ownerId),
    index('tasks_status_idx').on(table.status),
    index('tasks_deadline_idx').on(table.deadline),
    index('tasks_project_idx').on(table.projectId),
  ]
);

// 5. Note Categories
export const noteCategories = pgTable(
  'note_categories',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    folder: text('folder').notNull().default('General'),
    color: text('color').notNull().default('#2563EB'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('note_categories_owner_idx').on(table.ownerId)]
);

// 6. Personal Notes
export const notes = pgTable(
  'notes',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: integer('category_id').references(() => noteCategories.id, {
      onDelete: 'set null',
    }),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    folder: text('folder').notNull().default('General'),
    tags: jsonb('tags').$type<string[]>().default([]),
    isPinned: boolean('is_pinned').notNull().default(false),
    isFavorite: boolean('is_favorite').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('notes_owner_idx').on(table.ownerId),
    index('notes_folder_idx').on(table.folder),
    index('notes_project_idx').on(table.projectId),
  ]
);

// 7. Calendar Events & Daily Planner Schedule
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description').default(''),
    eventDate: text('event_date').notNull(), // YYYY-MM-DD
    startTime: text('start_time').notNull().default('09:00'), // HH:mm
    endTime: text('end_time').notNull().default('10:00'), // HH:mm
    category: text('category').notNull().default('Work'),
    eventType: text('event_type').notNull().default('schedule'), // schedule | event | meeting | reminder
    reminderMinutes: integer('reminder_minutes').default(15),
    isCompleted: boolean('is_completed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('calendar_events_owner_idx').on(table.ownerId),
    index('calendar_events_date_idx').on(table.eventDate),
  ]
);

// 8. Data Categories (Flexible Data Entry Manager)
export const dataCategories = pgTable(
  'data_categories',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description').default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('data_categories_owner_idx').on(table.ownerId)]
);

// 9. Custom Fields for Data Categories
export const customFields = pgTable(
  'custom_fields',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .references(() => dataCategories.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    fieldKey: text('field_key').notNull(),
    fieldType: text('field_type').notNull().default('text'), // text | number | date | email | phone | dropdown
    options: jsonb('options').$type<string[]>().default([]),
    required: boolean('required').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('custom_fields_category_idx').on(table.categoryId)]
);

// 10. Custom Records
export const customRecords = pgTable(
  'custom_records',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: integer('category_id')
      .references(() => dataCategories.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    data: jsonb('data').$type<Record<string, string | number | null>>().default({}).notNull(),
    notes: text('notes').default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('custom_records_owner_idx').on(table.ownerId),
    index('custom_records_category_idx').on(table.categoryId),
  ]
);

// 11. Financial Transactions (Default BDT)
export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(), // income | expense
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    category: text('category').notNull(),
    transactionDate: text('transaction_date').notNull(), // YYYY-MM-DD
    paymentMethod: text('payment_method').notNull().default('Bank Transfer'),
    description: text('description').default(''),
    reference: text('reference').default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('transactions_owner_idx').on(table.ownerId),
    index('transactions_date_idx').on(table.transactionDate),
    index('transactions_type_idx').on(table.type),
  ]
);

// 12. Files & Document Manager (Securely stored in DB for persistent cloud storage)
export const files = pgTable(
  'files',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    taskId: integer('task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull().default('application/octet-stream'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    folder: text('folder').notNull().default('General'),
    description: text('description').default(''),
    fileData: text('file_data').notNull(), // Base64 encoded content
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('files_owner_idx').on(table.ownerId),
    index('files_folder_idx').on(table.folder),
    index('files_project_idx').on(table.projectId),
    index('files_task_idx').on(table.taskId),
  ]
);

// 13. Activity Logs
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    action: text('action').notNull(), // created | updated | completed | deleted | uploaded | login | password_changed
    entityType: text('entity_type').notNull(), // task | project | note | record | transaction | file | event | system
    entityId: integer('entity_id'),
    summary: text('summary').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('activity_logs_owner_idx').on(table.ownerId),
    index('activity_logs_created_idx').on(table.createdAt),
    index('activity_logs_entity_idx').on(table.entityType),
  ]
);

// 14. Notifications
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => adminUsers.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').notNull().default('info'), // info | warning | deadline | success
    isRead: boolean('is_read').notNull().default(false),
    linkModule: text('link_module'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('notifications_owner_idx').on(table.ownerId),
    index('notifications_read_idx').on(table.isRead),
  ]
);

// Relations
export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  sessions: many(adminSessions),
  projects: many(projects),
  tasks: many(tasks),
  notes: many(notes),
  noteCategories: many(noteCategories),
  calendarEvents: many(calendarEvents),
  dataCategories: many(dataCategories),
  customRecords: many(customRecords),
  transactions: many(transactions),
  files: many(files),
  activityLogs: many(activityLogs),
  notifications: many(notifications),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(adminUsers, {
    fields: [projects.ownerId],
    references: [adminUsers.id],
  }),
  tasks: many(tasks),
  notes: many(notes),
  files: many(files),
  transactions: many(transactions),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  owner: one(adminUsers, {
    fields: [tasks.ownerId],
    references: [adminUsers.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  files: many(files),
}));

export const dataCategoriesRelations = relations(dataCategories, ({ one, many }) => ({
  owner: one(adminUsers, {
    fields: [dataCategories.ownerId],
    references: [adminUsers.id],
  }),
  fields: many(customFields),
  records: many(customRecords),
}));

export const customFieldsRelations = relations(customFields, ({ one }) => ({
  category: one(dataCategories, {
    fields: [customFields.categoryId],
    references: [dataCategories.id],
  }),
}));

export const customRecordsRelations = relations(customRecords, ({ one }) => ({
  owner: one(adminUsers, {
    fields: [customRecords.ownerId],
    references: [adminUsers.id],
  }),
  category: one(dataCategories, {
    fields: [customRecords.categoryId],
    references: [dataCategories.id],
  }),
}));
