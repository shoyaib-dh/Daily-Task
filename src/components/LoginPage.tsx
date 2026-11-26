import React, { useEffect, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, setFirebaseTokenProvider, setSessionToken } from '../lib/api';
import type { AdminProfile } from '../types/poms';
import { Button, Input, Label } from './ui/primitives';

interface LoginPageProps {
  onAuthenticated: (admin: AdminProfile) => void;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [username, setUsername] = useState('shoyaibwork');
  const [displayName, setDisplayName] = useState('Shoyaib');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiFetch<{ needsSetup: boolean; defaultUsername: string }>(
          '/api/auth/status'
        );
        if (!active) return;
        setNeedsSetup(res.needsSetup);
        if (res.defaultUsername) setUsername(res.defaultUsername);
      } catch (err: any) {
        if (active) setErrorMessage(err.message || 'Unable to connect to server.');
      } finally {
        if (active) setCheckingStatus(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (needsSetup) {
      if (password.length < 8) {
        setErrorMessage('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint = needsSetup ? '/api/auth/setup' : '/api/auth/login';
      const payload = needsSetup
        ? { username: username.trim(), password, displayName: displayName.trim(), email: email.trim() }
        : { username: username.trim(), password };

      const res = await apiFetch<{ admin: AdminProfile; sessionToken: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSessionToken(res.sessionToken);
      toast.success(
        needsSetup
          ? 'Admin account initialized securely.'
          : `Welcome back, ${res.admin.displayName || res.admin.username}.`
      );
      onAuthenticated(res.admin);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      setFirebaseTokenProvider(async () => {
        const current = auth.currentUser;
        return current ? current.getIdToken() : null;
      });
      const idToken = await result.user.getIdToken();
      const res = await apiFetch<{ admin: AdminProfile }>('/api/auth/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      toast.success(`Signed in as ${res.admin.displayName || res.admin.username}.`);
      onAuthenticated(res.admin);
    } catch (err: any) {
      setFirebaseTokenProvider(null);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err.message || 'Google sign-in failed.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 dark:bg-blue-600 text-white font-display font-bold text-base tracking-tight">
            PO
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Personal Office Management
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {needsSetup
              ? 'Configure your private administrator password to unlock your workspace.'
              : 'Sign in with your administrator credentials to continue.'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-7 shadow-sm">
          {checkingStatus ? (
            <div className="space-y-4 py-6">
              <div className="h-9 rounded-lg bg-muted animate-pulse" />
              <div className="h-9 rounded-lg bg-muted animate-pulse" />
              <div className="h-10 rounded-lg bg-muted animate-pulse" />
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {needsSetup ? 'Initial Admin Setup' : 'Administrator Sign In'}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {needsSetup
                      ? 'Password is hashed server-side with bcrypt.'
                      : 'Protected by rate limiting and HTTP-only sessions.'}
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300"
                >
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="admin-username">Admin Username</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="admin-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                      className="pl-9"
                      placeholder="shoyaibwork"
                    />
                  </div>
                </div>

                {needsSetup && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="admin-display-name">Display Name</Label>
                      <Input
                        id="admin-display-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Shoyaib"
                      />
                    </div>
                    <div>
                      <Label htmlFor="admin-email">Email (optional)</Label>
                      <Input
                        id="admin-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@office.local"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="admin-password">
                    {needsSetup ? 'Create Strong Password (min 8 chars)' : 'Password'}
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={needsSetup ? 'new-password' : 'current-password'}
                      required
                      className="pl-9 pr-10"
                      placeholder={needsSetup ? 'Minimum 8 characters' : 'Enter your password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {needsSetup && (
                  <div>
                    <Label htmlFor="admin-confirm-password">Confirm Password</Label>
                    <Input
                      id="admin-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                      placeholder="Re-enter password"
                    />
                  </div>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting
                    ? needsSetup
                      ? 'Initializing Workspace...'
                      : 'Signing In...'
                    : needsSetup
                      ? 'Initialize Admin Account'
                      : 'Sign In to Workspace'}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                size="lg"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
              >
                {googleLoading ? 'Connecting Google...' : 'Continue with Google Account'}
              </Button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Private single-administrator system · All records persisted in PostgreSQL
        </p>
      </div>
    </div>
  );
}
