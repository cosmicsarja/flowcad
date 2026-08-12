-- FlowCAD bootstrap migration
-- Safe to run multiple times (IF NOT EXISTS everywhere)

-- ── projects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid,
    prompt       text        NOT NULL DEFAULT '',
    title        text        NOT NULL DEFAULT 'New Project',
    status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','generating','done','failed')),
    design_state jsonb       NOT NULL DEFAULT '{}',
    thumbnail_url text,
    share_token  text        UNIQUE DEFAULT gen_random_uuid()::text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── project_versions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_versions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_num  int  NOT NULL DEFAULT 1,
    design_state jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id                     uuid        PRIMARY KEY,
    email                  text,
    full_name              text,
    avatar_url             text,
    generations_this_month int         NOT NULL DEFAULT 0,
    month_reset_at         timestamptz NOT NULL DEFAULT date_trunc('month', now()),
    created_at             timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: enable but allow anon reads/writes for dev ──────────────────────────
ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist (so re-running is safe)
DROP POLICY IF EXISTS "anon_all_projects"        ON projects;
DROP POLICY IF EXISTS "anon_all_project_versions" ON project_versions;
DROP POLICY IF EXISTS "anon_all_profiles"         ON profiles;

-- Allow all for anon/authenticated (dev mode — tighten in production)
CREATE POLICY "anon_all_projects"         ON projects         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_project_versions" ON project_versions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_profiles"         ON profiles         FOR ALL USING (true) WITH CHECK (true);
