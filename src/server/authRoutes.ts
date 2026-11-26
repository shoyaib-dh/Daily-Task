import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { adminUsers } from '../db/schema.ts';
import {
  DEFAULT_ADMIN_USERNAME,
  createSession,
  deleteAllSessionsForAdmin,
  deleteSessionByToken,
  ensureAdminFromEnvOrSetup,
  getAdminByUsername,
  getPrimaryAdmin,
  logActivity,
  sanitizeAdminProfile,
} from '../db/repository.ts';
import {
  AuthRequest,
  SESSION_COOKIE_NAME,
  checkLoginRateLimit,
  clearLoginRateLimit,
  clearSessionCookie,
  recordFailedLogin,
  requireAuth,
  setSessionCookie,
} from '../middleware/auth.ts';

const router = Router();

const setupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, underscores, or hyphens')
    .optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  displayName: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
});

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64),
  password: z.string().min(1, 'Password is required').max(128),
});

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal('')),
  avatarUrl: z
    .string()
    .max(2_000_000)
    .nullable()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        if (val.startsWith('/src/assets/')) return true;
        if (val.startsWith('https://')) return true;
        if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(val)) {
          return true;
        }
        return false;
      },
      { message: 'Avatar must be a valid HTTPS URL or PNG/JPEG/WebP image.' }
    ),
  currency: z.enum(['BDT', 'USD', 'EUR', 'GBP', 'INR']).optional(),
  dateFormat: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY']).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  notificationsEnabled: z.boolean().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
});

function timingSafeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getConfiguredEnvPassword(): string {
  const raw = (process.env.ADMIN_INITIAL_PASSWORD || '').trim();
  const unquoted = raw.replace(/^["'](.*)["']$/, '$1').trim();
  return unquoted;
}

// Check whether first-run local admin setup is needed
router.get('/status', async (_req, res) => {
  try {
    const envPassword = getConfiguredEnvPassword();
    const existing = await getPrimaryAdmin();
    const needsSetup = !envPassword && (!existing || !existing.passwordHash);
    return res.json({
      needsSetup,
      defaultUsername: existing?.username || DEFAULT_ADMIN_USERNAME,
    });
  } catch (error: any) {
    console.error('Auth status error:', error);
    return res.status(500).json({ error: error.message || 'Unable to check auth status.' });
  }
});

// One-time local admin password setup (locked permanently once configured or if env password exists)
router.post('/setup', async (req, res) => {
  try {
    const envPassword = getConfiguredEnvPassword();
    if (envPassword) {
      return res.status(403).json({
        error: 'Initial admin credentials are already configured via environment variables.',
      });
    }

    const existing = await getPrimaryAdmin();
    if (existing?.passwordHash) {
      return res.status(403).json({
        error: 'Admin password has already been initialized. Please sign in.',
      });
    }

    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid setup payload.',
      });
    }

    const username = parsed.data.username || existing?.username || DEFAULT_ADMIN_USERNAME;
    const admin = await ensureAdminFromEnvOrSetup(
      username,
      parsed.data.password,
      parsed.data.displayName || 'Shoyaib',
      parsed.data.email || undefined
    );

    const { rawToken } = await createSession(
      admin.id,
      req.headers['user-agent'],
      req.ip
    );
    setSessionCookie(res, rawToken);
    await logActivity(admin.id, 'login', 'system', `Initialized admin workspace for ${admin.username}`);

    return res.status(201).json({
      admin: sanitizeAdminProfile(admin),
      sessionToken: `poms_${rawToken}`,
    });
  } catch (error: any) {
    console.error('Admin setup error:', error);
    return res.status(500).json({ error: error.message || 'Failed to initialize admin account.' });
  }
});

// Standard admin username + password sign-in with rate limiting
router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Username and password are required.',
      });
    }

    const { username, password } = parsed.data;
    const rateKey = `${req.ip || 'unknown'}:${username.toLowerCase()}`;
    const limit = checkLoginRateLimit(rateKey);
    if (!limit.allowed) {
      return res.status(429).json({
        error: `Too many failed sign-in attempts. Please wait ${limit.retryAfterSeconds} seconds and try again.`,
      });
    }

    const envPassword = getConfiguredEnvPassword();
    const envUsername = DEFAULT_ADMIN_USERNAME;
    let admin = await getAdminByUsername(username);
    let authenticated = false;

    // Environment variable password overrides fallback hash if configured
    if (envPassword && username.toLowerCase() === envUsername.toLowerCase()) {
      if (timingSafeCompare(password, envPassword)) {
        admin = await ensureAdminFromEnvOrSetup(envUsername, envPassword);
        authenticated = true;
      } else if (admin?.passwordHash) {
        // Allow updated password if admin explicitly changed it in settings
        authenticated = await bcrypt.compare(password, admin.passwordHash);
      }
    } else if (admin?.passwordHash) {
      authenticated = await bcrypt.compare(password, admin.passwordHash);
    }

    if (!authenticated || !admin) {
      recordFailedLogin(rateKey);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    clearLoginRateLimit(rateKey);
    const { rawToken } = await createSession(
      admin.id,
      req.headers['user-agent'],
      req.ip
    );
    setSessionCookie(res, rawToken);
    await logActivity(admin.id, 'login', 'system', `Signed in as ${admin.username}`);

    return res.json({
      admin: sanitizeAdminProfile(admin),
      sessionToken: `poms_${rawToken}`,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: error.message || 'Sign-in failed. Please try again.' });
  }
});

// Logout
router.post('/logout', async (req: AuthRequest, res) => {
  try {
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (cookieToken && typeof cookieToken === 'string') {
      await deleteSessionByToken(cookieToken);
    }
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer poms_')) {
      const rawToken = authHeader.slice('Bearer poms_'.length).trim();
      await deleteSessionByToken(rawToken);
    }
    clearSessionCookie(res);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Logout error:', error);
    clearSessionCookie(res);
    return res.json({ success: true });
  }
});

// Current authenticated admin profile
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  return res.json({ admin: sanitizeAdminProfile(req.admin!) });
});

// Update profile & application preferences
router.put('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid profile update.',
      });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName;
    if (parsed.data.email !== undefined) updates.email = parsed.data.email || null;
    if (parsed.data.avatarUrl !== undefined) updates.avatarUrl = parsed.data.avatarUrl || null;
    if (parsed.data.currency !== undefined) updates.currency = parsed.data.currency;
    if (parsed.data.dateFormat !== undefined) updates.dateFormat = parsed.data.dateFormat;
    if (parsed.data.theme !== undefined) updates.theme = parsed.data.theme;
    if (parsed.data.notificationsEnabled !== undefined) {
      updates.notificationsEnabled = parsed.data.notificationsEnabled;
    }

    const [updated] = await db
      .update(adminUsers)
      .set(updates)
      .where(eq(adminUsers.id, req.admin!.id))
      .returning();

    await logActivity(req.admin!.id, 'updated', 'system', 'Updated admin profile and workspace preferences');
    return res.json({ admin: sanitizeAdminProfile(updated) });
  } catch (error: any) {
    console.error('Profile update error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update profile.' });
  }
});

// Secure password change
router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid password payload.',
      });
    }

    const admin = req.admin!;
    if (admin.passwordHash) {
      if (!parsed.data.currentPassword) {
        return res.status(400).json({ error: 'Current password is required.' });
      }
      const matches = await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash);
      if (!matches) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }

    const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db
      .update(adminUsers)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(adminUsers.id, admin.id));

    // Invalidate all existing sessions and issue a fresh one
    await deleteAllSessionsForAdmin(admin.id);
    const { rawToken } = await createSession(admin.id, req.headers['user-agent'], req.ip);
    setSessionCookie(res, rawToken);
    await logActivity(admin.id, 'password_changed', 'system', 'Changed admin account password');

    return res.json({
      success: true,
      sessionToken: `poms_${rawToken}`,
    });
  } catch (error: any) {
    console.error('Password change error:', error);
    return res.status(500).json({ error: error.message || 'Failed to change password.' });
  }
});

export default router;
