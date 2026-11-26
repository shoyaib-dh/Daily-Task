import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  activityLogs,
  adminSessions,
  adminUsers,
  calendarEvents,
  customFields,
  customRecords,
  dataCategories,
  files,
  noteCategories,
  notes,
  notifications,
  projects,
  tasks,
  transactions,
} from './schema.ts';

export const DEFAULT_ADMIN_USERNAME =
  (process.env.ADMIN_USERNAME || 'shoyaibwork').trim() || 'shoyaibwork';

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function getPrimaryAdmin() {
  try {
    const rows = await db
      .select()
      .from(adminUsers)
      .orderBy(adminUsers.id)
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed (getPrimaryAdmin):', error);
    throw new Error('Unable to access admin account.', { cause: error });
  }
}

export async function getAdminById(id: number) {
  try {
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed (getAdminById):', error);
    throw new Error('Unable to load admin profile.', { cause: error });
  }
}

export async function getAdminByUsername(username: string) {
  try {
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed (getAdminByUsername):', error);
    throw new Error('Unable to verify credentials.', { cause: error });
  }
}

export async function ensureAdminFromEnvOrSetup(
  username: string,
  plainPassword: string,
  displayName?: string,
  email?: string
) {
  try {
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const existing = await getPrimaryAdmin();
    if (existing) {
      const updated = await db
        .update(adminUsers)
        .set({
          username: username || existing.username,
          passwordHash,
          displayName: displayName || existing.displayName,
          email: email ?? existing.email,
          updatedAt: new Date(),
        })
        .where(eq(adminUsers.id, existing.id))
        .returning();
      return updated[0];
    }

    const inserted = await db
      .insert(adminUsers)
      .values({
        username: username || DEFAULT_ADMIN_USERNAME,
        displayName: displayName || 'Shoyaib',
        email: email || null,
        passwordHash,
        currency: 'BDT',
        dateFormat: 'YYYY-MM-DD',
        theme: 'light',
        notificationsEnabled: true,
      })
      .onConflictDoUpdate({
        target: adminUsers.username,
        set: {
          passwordHash,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed (ensureAdminFromEnvOrSetup):', error);
    throw new Error('Failed to initialize admin account.', { cause: error });
  }
}

export async function getOrCreateAdminByFirebaseUid(
  uid: string,
  email?: string,
  displayName?: string
) {
  try {
    // 1. Check if this UID already exists
    const byUid = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.uid, uid))
      .limit(1);
    if (byUid[0]) {
      return byUid[0];
    }

    // 2. Single-admin model: if an admin exists without a Firebase UID yet, link it
    const existing = await getPrimaryAdmin();
    if (existing) {
      if (!existing.uid) {
        const linked = await db
          .update(adminUsers)
          .set({
            uid,
            email: existing.email || email || null,
            displayName: existing.displayName || displayName || 'Shoyaib',
            updatedAt: new Date(),
          })
          .where(eq(adminUsers.id, existing.id))
          .returning();
        return linked[0];
      }
      // Another Firebase account trying to access a private single-admin workspace
      return null;
    }

    // 3. First user ever via Google Sign-In claims the private single-admin workspace
    const inserted = await db
      .insert(adminUsers)
      .values({
        uid,
        username: DEFAULT_ADMIN_USERNAME,
        email: email || null,
        displayName: displayName || 'Shoyaib',
        currency: 'BDT',
        dateFormat: 'YYYY-MM-DD',
        theme: 'light',
        notificationsEnabled: true,
      })
      .onConflictDoUpdate({
        target: adminUsers.uid,
        set: {
          email: email || null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed (getOrCreateAdminByFirebaseUid):', error);
    throw new Error('Unable to synchronize admin account.', { cause: error });
  }
}

export async function createSession(
  adminId: number,
  userAgent?: string,
  ipAddress?: string
) {
  try {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(adminSessions).values({
      adminId,
      tokenHash,
      expiresAt,
      userAgent: userAgent?.slice(0, 250) || null,
      ipAddress: ipAddress?.slice(0, 64) || null,
    });

    return { rawToken, expiresAt };
  } catch (error) {
    console.error('Database query failed (createSession):', error);
    throw new Error('Failed to create session.', { cause: error });
  }
}

export async function verifySessionToken(rawToken: string) {
  try {
    const tokenHash = hashSessionToken(rawToken);
    const rows = await db
      .select({
        session: adminSessions,
        admin: adminUsers,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminSessions.adminId, adminUsers.id))
      .where(eq(adminSessions.tokenHash, tokenHash))
      .limit(1);

    const record = rows[0];
    if (!record) return null;

    if (new Date(record.session.expiresAt).getTime() < Date.now()) {
      await db
        .delete(adminSessions)
        .where(eq(adminSessions.id, record.session.id));
      return null;
    }

    return record.admin;
  } catch (error) {
    console.error('Database query failed (verifySessionToken):', error);
    throw new Error('Session validation failed.', { cause: error });
  }
}

export async function deleteSessionByToken(rawToken: string) {
  try {
    const tokenHash = hashSessionToken(rawToken);
    await db
      .delete(adminSessions)
      .where(eq(adminSessions.tokenHash, tokenHash));
  } catch (error) {
    console.error('Database query failed (deleteSessionByToken):', error);
  }
}

export async function deleteAllSessionsForAdmin(adminId: number) {
  try {
    await db.delete(adminSessions).where(eq(adminSessions.adminId, adminId));
  } catch (error) {
    console.error('Database query failed (deleteAllSessionsForAdmin):', error);
  }
}

export async function logActivity(
  ownerId: number,
  action: string,
  entityType: string,
  summary: string,
  entityId?: number | null,
  metadata?: Record<string, unknown>
) {
  try {
    await db.insert(activityLogs).values({
      ownerId,
      action,
      entityType,
      entityId: entityId ?? null,
      summary,
      metadata: metadata || {},
    });
  } catch (error) {
    console.error('Failed to write activity log:', error);
  }
}

export async function createNotification(
  ownerId: number,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'deadline' | 'success' = 'info',
  linkModule?: string
) {
  try {
    await db.insert(notifications).values({
      ownerId,
      title,
      message,
      type,
      linkModule: linkModule || null,
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}

export function sanitizeAdminProfile(admin: typeof adminUsers.$inferSelect) {
  return {
    id: admin.id,
    username: admin.username,
    email: admin.email,
    displayName: admin.displayName,
    avatarUrl: admin.avatarUrl,
    currency: admin.currency,
    dateFormat: admin.dateFormat,
    theme: admin.theme,
    notificationsEnabled: admin.notificationsEnabled,
    hasPassword: Boolean(admin.passwordHash),
    hasGoogleLinked: Boolean(admin.uid),
    createdAt: admin.createdAt,
  };
}

export async function exportFullBackup(ownerId: number) {
  try {
    const [
      projectRows,
      taskRows,
      noteCatRows,
      noteRows,
      eventRows,
      dataCatRows,
      fieldRows,
      recordRows,
      txRows,
      fileMetaRows,
      activityRows,
    ] = await Promise.all([
      db.select().from(projects).where(eq(projects.ownerId, ownerId)),
      db.select().from(tasks).where(eq(tasks.ownerId, ownerId)),
      db.select().from(noteCategories).where(eq(noteCategories.ownerId, ownerId)),
      db.select().from(notes).where(eq(notes.ownerId, ownerId)),
      db.select().from(calendarEvents).where(eq(calendarEvents.ownerId, ownerId)),
      db.select().from(dataCategories).where(eq(dataCategories.ownerId, ownerId)),
      db.select().from(customFields),
      db.select().from(customRecords).where(eq(customRecords.ownerId, ownerId)),
      db.select().from(transactions).where(eq(transactions.ownerId, ownerId)),
      db
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
        .where(eq(files.ownerId, ownerId)),
      db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.ownerId, ownerId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(500),
    ]);

    const ownedCatIds = new Set(dataCatRows.map((c) => c.id));
    const ownedFields = fieldRows.filter((f) => ownedCatIds.has(f.categoryId));

    return {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      projects: projectRows,
      tasks: taskRows,
      noteCategories: noteCatRows,
      notes: noteRows,
      calendarEvents: eventRows,
      dataCategories: dataCatRows,
      customFields: ownedFields,
      customRecords: recordRows,
      transactions: txRows,
      filesMetadata: fileMetaRows,
      activityLogs: activityRows,
    };
  } catch (error) {
    console.error('Database query failed (exportFullBackup):', error);
    throw new Error('Failed to generate database backup.', { cause: error });
  }
}

export { and, desc, eq, gte, lte, sql };
