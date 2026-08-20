# Database schema sync fixes

Three targeted database changes so the backend stops erroring.

## 1. `name` column on projects
Add `name` as a nullable text column on `projects`. Existing rows get their current `title` copied into `name` so nothing looks empty.

## 2. Dev user ID
Recommendation: keep `profiles.id` as UUID and change the backend's `DEV_USER_ID` to `00000000-0000-0000-0000-000000000000`.

Reason: `profiles.id` is the link to Supabase Auth users, which are always UUIDs. Switching it to text would break that link, force a rewrite of `projects.user_id` and every auth rule that compares against the signed-in user, and permanently weaken the schema for a local-development convenience.

To make the zeroed UUID work, the migration also inserts a placeholder profile row with that id (email `dev@local`, name `Dev User`) so `projects.user_id` references resolve during local development.

## 3. project_versions foreign key
The existing constraint `project_versions_project_id_fkey` points at `projects.id` but its delete behaviour is not cascade-guaranteed. It will be dropped and recreated with `ON DELETE CASCADE`, so deleting a project removes its versions.

## Technical notes
- One migration: `ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS name text;`, backfill from `title`, insert the dev profile row, drop/recreate the FK with `ON DELETE CASCADE`.
- No RLS/grant changes; current policies already allow the backend's access pattern.
- No frontend code changes; generated Supabase types refresh automatically after the migration runs.

## After approval
Update the backend env var: `DEV_USER_ID=00000000-0000-0000-0000-000000000000`.
