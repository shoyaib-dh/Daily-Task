# Personal Office Management System (POMS)

A private, single-administrator Personal Office Management Web Application built with TypeScript, React, Express, Tailwind CSS, Recharts, Zod, and PostgreSQL (Drizzle ORM).

## Core Modules

1. **Dashboard** — Live date/clock, real-time KPI metrics, 7-day task throughput, 6-month cash flow, upcoming deadlines, and recent activity.
2. **My Tasks** — List view & drag-and-drop Kanban board, priorities, statuses, daily/weekly/monthly/overdue filters, sorting, and document attachments.
3. **Daily Planner & Calendar** — Hourly work schedules, start/end times, reminders, completion tracking, and Daily/Weekly/Monthly calendar views.
4. **My Notes** — Rich-text formatting toolbar & preview, folders, categories, pinning, favorites, tags, archiving, instant search, and debounced auto-save.
5. **Projects** — Project budgets, progress tracking, deadlines, and integrated project workspaces with linked tasks and notes.
6. **Data Manager** — Custom data categories, dynamic field builder (`text`, `number`, `date`, `email`, `phone`, `dropdown`), CRUD records, pagination, detail view, and CSV/Excel (`.xlsx`) import & export.
7. **Finance** — Income & expense ledger defaulting to BDT (`৳`), payment methods, date/category filters, financial charts, and CSV export.
8. **File Manager** — Secure document upload, folders, project/task linking, search, download, and deletion.
9. **Reports & Analytics** — Custom date-range productivity, project progress, and financial analytics with PDF and CSV exports.
10. **Activity History** — Automatic chronological audit log across all workspace modules.
11. **Settings** — Admin profile, avatar photo upload, secure bcrypt password change, Light/Dark theme, currency & date preferences, JSON database backup export, and sign out.

## Security Architecture

- **No hardcoded passwords**: Initial admin credentials are configured either via environment variables (`ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD`) or via the one-time first-run local setup screen (locked permanently after initialization).
- **Password hashing**: Server-side `bcryptjs` (12 salt rounds).
- **Sessions**: Server-side expiring sessions (24h) stored as SHA-256 hashes in PostgreSQL with `HttpOnly; Secure; SameSite=None; Partitioned` cookies, CSRF header/origin validation, and login rate limiting (5 attempts / 15 min).
- **Google Sign-In**: Supported alongside admin credentials via Firebase Authentication (restricted to the single workspace administrator).
- **Parameterized queries**: All database operations use Drizzle ORM parameterized queries and Zod request validation.

## Local Setup & Environment Variables

1. Copy `.env.example` to `.env` (never commit `.env` to GitHub):
   ```bash
   cp .env.example .env
   ```
2. Configure your PostgreSQL connection (`SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`) and optional `ADMIN_USERNAME` / `ADMIN_INITIAL_PASSWORD`.
3. Install dependencies and push the relational database schema:
   ```bash
   npm install
   npm run db:push
   ```
4. Start the development server on port 3000:
   ```bash
   npm run dev
   ```

## GitHub Push & Deployment

1. Verify `.env` is ignored (`.gitignore` excludes all `.env*` files):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Personal Office Management System"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. Configure the same environment variables in your hosting provider's Secrets / Environment Variables panel before deploying (`npm run build` followed by `npm start`).
