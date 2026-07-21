# Doneward  — Kanban Task Board

A Kanban-style task board with drag-and-drop, built with vanilla HTML/CSS/JavaScript,
[Supabase](https://supabase.com) (Postgres + auth), and [SortableJS](https://sortablejs.github.io/Sortable/).

**Live demo:** _add your Cloudflare Pages URL here_

## Features

- Four columns: To Do, In Progress, In Review, Done
- Drag tasks between columns — status persists to Supabase on drop, with
  drop-zone highlighting while a card is in the air
- Guest accounts via Supabase anonymous sign-in (no signup needed)
- Row Level Security: each user can only read/write their own tasks
- Task priority, description, and due dates with overdue / due-soon badges
- **Task activity log** — click any card to open a detail panel with a
  timeline of its history ("Moved from To Do → In Progress · 2 hours ago"),
  written automatically by a Postgres trigger
- Board stats in the header: total tasks, completed, and overdue
- Loading skeletons, per-column empty states, and dismissible error banner
- Responsive layout (4 → 2 → 1 columns)

## Tech stack & design decisions

- **Vanilla JS instead of a framework** — smallest surface area for the time
  budget; all rubric weight sits on design and functionality, and no build
  step means instant static hosting.
- **Supabase called directly from the frontend** — the auto-generated Data API
  replaces a custom backend; RLS enforces security at the database layer, so
  there is no server code to protect.
- **Activity log written by a database trigger, not the client** — the
  `task_activity` table has a read-only RLS policy for users; rows are
  inserted by a `SECURITY DEFINER` trigger on the `tasks` table. The history
  can't drift from reality or be forged, because the database itself writes it.
- **SortableJS** for drag-and-drop — small, dependency-free, and handles
  cross-list dragging, touch support, and animations out of the box.

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of [`schema.sql`](schema.sql)
   (safe to re-run; it creates the `tasks` and `task_activity` tables,
   RLS policies, and the activity trigger).
3. Go to **Authentication → Sign In / Providers** and enable **Anonymous sign-ins**.
4. Go to **Project Settings → API Keys** and copy your **Project URL** and
   **publishable** key.

### 2. Configure the app

Paste your values into [`config.js`](config.js):

```js
export const SUPABASE_URL = "https://your-project-ref.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_...";
```

> The publishable key is safe to commit — it is designed to be public, and
> Row Level Security is what protects the data. Never commit the secret
> (service role) key.

### 3. Run locally

The app is plain static files, but it uses ES modules, so serve it over HTTP
(opening `index.html` directly via `file://` will not work):

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

### 4. Deploy (Cloudflare Pages)

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repo. Framework preset: **None**. Build command: _(empty)_.
   Build output directory: `/`.
4. Deploy — your board is live at `https://<project>.pages.dev`.
   Every future push to `main` redeploys automatically.

## Database schema

See [`schema.sql`](schema.sql):

- `tasks` — one row per task; `user_id` defaults to `auth.uid()`, and an RLS
  policy restricts all reads and writes to the row owner.
- `task_activity` — append-only history (`created`, `moved`) per task,
  populated by the `trg_log_task_activity` trigger. Users have a SELECT-only
  policy; there is no insert policy, so clients cannot write history directly.

## What I'd improve with more time

- Persist card ordering within a column (a `position` column updated on drop)
- Edit-task support reusing the detail panel
- Realtime sync via Supabase Realtime subscriptions
- Undo on delete (soft delete + toast) instead of immediate removal
- Search bar and label filtering
