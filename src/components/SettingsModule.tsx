import React, { useRef, useState } from 'react';
import { Download, KeyRound, LogOut, Moon, Sun, Upload, User } from 'lucide-react';
import { toast } from 'sonner';
import { apiDownload, apiFetch, setSessionToken } from '../lib/api';
import { getTodayIso } from '../lib/utils';
import type { AdminProfile } from '../types/poms';
import { Button, Input, Label, Select, Switch } from './ui/primitives';

export const DEFAULT_AVATAR_URL =
  '/src/assets/images/admin_profile_avatar_1795669173772.jpg';

interface SettingsModuleProps {
  admin: AdminProfile;
  onAdminUpdated: (admin: AdminProfile) => void;
  onLogout: () => void;
}

export function SettingsModule({ admin, onAdminUpdated, onLogout }: SettingsModuleProps) {
  const [displayName, setDisplayName] = useState(admin.displayName || '');
  const [email, setEmail] = useState(admin.email || '');
  const [avatarUrl, setAvatarUrl] = useState(admin.avatarUrl || DEFAULT_AVATAR_URL);
  const [currency, setCurrency] = useState(admin.currency || 'BDT');
  const [dateFormat, setDateFormat] = useState(admin.dateFormat || 'YYYY-MM-DD');
  const [theme, setTheme] = useState<'light' | 'dark'>(admin.theme || 'light');
  const [notificationsEnabled, setNotificationsEnabled] = useState(admin.notificationsEnabled);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Please upload a PNG, JPEG, or WebP photo.');
      return;
    }
    if (file.size > 1_200_000) {
      toast.error('Profile photo must be smaller than 1.2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarError(false);
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiFetch<{ admin: AdminProfile }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: displayName.trim() || admin.username,
          email: email.trim() || null,
          avatarUrl: avatarUrl || null,
          currency,
          dateFormat,
          theme,
          notificationsEnabled,
        }),
      });
      onAdminUpdated(res.admin);
      toast.success('Profile and preferences saved.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update settings.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await apiFetch<{ success: boolean; sessionToken?: string }>(
        '/api/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: currentPassword || undefined,
            newPassword,
          }),
        }
      );
      if (res.sessionToken) setSessionToken(res.sessionToken);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated securely. All other sessions were signed out.');
    } catch (err: any) {
      toast.error(err.message || 'Password change failed.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleBackupExport = async () => {
    setExportingBackup(true);
    try {
      await apiDownload('/api/backup/export', `poms-backup-${getTodayIso()}.json`);
      toast.success('Full database JSON backup downloaded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to export backup.');
    } finally {
      setExportingBackup(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your administrator profile, security password, theme, localization, and database backup.
        </p>
      </div>

      {/* Admin Profile & Preferences */}
      <form
        onSubmit={handleSaveProfile}
        className="rounded-xl border border-border bg-card p-6 space-y-6"
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Admin Profile &amp; Preferences
            </h2>
          </div>
          <span className="font-mono text-xs text-muted-foreground">@{admin.username}</span>
        </div>

        {/* Profile photo */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-16 w-16 rounded-full border border-border bg-muted overflow-hidden flex items-center justify-center shrink-0">
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={displayName || admin.username}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display text-lg font-bold text-foreground">
                {(displayName || admin.username).slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Change Photo
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAvatarError(false);
                  setAvatarUrl(DEFAULT_AVATAR_URL);
                }}
              >
                Reset Default
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP up to 1.2 MB.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="set-name">Display Name</Label>
            <Input
              id="set-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="set-email">Admin Email</Label>
            <Input
              id="set-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@office.local"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="set-currency">Default Currency</Label>
            <Select
              id="set-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="BDT">BDT (৳) — Bangladeshi Taka</option>
              <option value="USD">USD ($) — US Dollar</option>
              <option value="EUR">EUR (€) — Euro</option>
              <option value="GBP">GBP (£) — British Pound</option>
              <option value="INR">INR (₹) — Indian Rupee</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="set-datefmt">Date Format</Label>
            <Select
              id="set-datefmt"
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD MMM YYYY">DD MMM YYYY</option>
            </Select>
          </div>

          <div>
            <Label>Theme Appearance</Label>
            <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                  theme === 'light'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                Dark
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">Deadline &amp; Activity Reminders</div>
            <div className="text-xs text-muted-foreground">
              Enable workspace notifications for upcoming tasks and scheduled events.
            </div>
          </div>
          <Switch
            checked={notificationsEnabled}
            onCheckedChange={setNotificationsEnabled}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </form>

      {/* Change Password */}
      <form
        onSubmit={handlePasswordChange}
        className="rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-border pb-4">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Security &amp; Password</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {admin.hasPassword && (
            <div>
              <Label htmlFor="pw-cur">Current Password</Label>
              <Input
                id="pw-cur"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
          )}
          <div>
            <Label htmlFor="pw-new">New Password (min 8 chars)</Label>
            <Input
              id="pw-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="pw-conf">Confirm New Password</Label>
            <Input
              id="pw-conf"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={savingPassword}>
            {savingPassword ? 'Updating Password...' : 'Update Password'}
          </Button>
        </div>
      </form>

      {/* Database Backup & Session Sign Out */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Database Backup &amp; Export</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Download a full JSON archive of all tasks, projects, notes, records, transactions, and activity logs.
            </p>
          </div>
          <div>
            <Button variant="outline" onClick={handleBackupExport} disabled={exportingBackup}>
              <Download className="h-4 w-4" />
              {exportingBackup ? 'Preparing Export...' : 'Export JSON Backup'}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">End Administrator Session</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sign out and invalidate the active HTTP-only session cookie on this device.
            </p>
          </div>
          <div>
            <Button variant="destructive" onClick={onLogout}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
