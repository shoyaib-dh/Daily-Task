import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import {
  getOrCreateAdminByFirebaseUid,
  verifySessionToken,
} from '../db/repository.ts';
import type { adminUsers } from '../db/schema.ts';

export const SESSION_COOKIE_NAME = 'poms_session';

export interface AuthRequest extends Request {
  admin?: typeof adminUsers.$inferSelect;
  authMethod?: 'session_cookie' | 'session_bearer' | 'firebase';
}

// Simple in-memory sliding-window login rate limiter (max 5 failed attempts per 15 min)
interface RateLimitEntry {
  attempts: number[];
}

const loginAttempts = new Map<string, RateLimitEntry>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function checkLoginRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const entry = loginAttempts.get(key) || { attempts: [] };
  entry.attempts = entry.attempts.filter((ts) => now - ts < WINDOW_MS);
  loginAttempts.set(key, entry);

  if (entry.attempts.length >= MAX_ATTEMPTS) {
    const oldest = entry.attempts[0];
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key) || { attempts: [] };
  entry.attempts = entry.attempts.filter((ts) => now - ts < WINDOW_MS);
  entry.attempts.push(now);
  loginAttempts.set(key, entry);
}

export function clearLoginRateLimit(key: string): void {
  loginAttempts.delete(key);
}

export function setSessionCookie(res: Response, rawToken: string): void {
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  });
}

function isMutatingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

function verifyCsrfForCookie(req: Request): boolean {
  if (!isMutatingMethod(req.method)) return true;

  // Custom header check (blocks simple cross-site form submits)
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return true;
  }

  // Fallback: verify Origin matches Host / X-Forwarded-Host
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    // 1. Check Authorization Bearer header (either custom poms_ session token or Firebase ID token)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();

      if (token.startsWith('poms_')) {
        const rawSession = token.slice('poms_'.length);
        const admin = await verifySessionToken(rawSession);
        if (admin) {
          req.admin = admin;
          req.authMethod = 'session_bearer';
          return next();
        }
        return res.status(401).json({ error: 'Session expired. Please sign in again.' });
      }

      // Firebase ID token verification
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        const admin = await getOrCreateAdminByFirebaseUid(
          decoded.uid,
          decoded.email,
          decoded.name
        );
        if (!admin) {
          return res.status(403).json({
            error: 'Access denied. This workspace belongs to a different administrator.',
          });
        }
        req.admin = admin;
        req.authMethod = 'firebase';
        return next();
      } catch {
        return res.status(401).json({ error: 'Invalid or expired authentication token.' });
      }
    }

    // 2. Check HTTP-only session cookie
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (cookieToken && typeof cookieToken === 'string') {
      if (!verifyCsrfForCookie(req)) {
        return res.status(403).json({ error: 'CSRF validation failed.' });
      }
      const admin = await verifySessionToken(cookieToken);
      if (admin) {
        req.admin = admin;
        req.authMethod = 'session_cookie';
        return next();
      }
    }

    return res.status(401).json({ error: 'Authentication required.' });
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication service temporarily unavailable.' });
  }
};
