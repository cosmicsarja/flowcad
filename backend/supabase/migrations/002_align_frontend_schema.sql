-- FlowCAD Schema — Migration 002
-- Aligns backend with Lovable frontend table shape.
-- Safe to run multiple times (all statements use IF NOT EXISTS / IF EXISTS).
--
-- Run with:
--   supabase db push
-- OR:
--   psql $DATABASE_URL -f 002_align_frontend_schema.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles: one row per auth user (linked to auth.users)
-- Tracks monthly usage for free-tier limiting.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email                   text,
    full_name               text,
    avatar_url              text,
    generations_this_month  int         NOT NULL DEFAULT 0,
    month_reset_at          timestamptz NOT NULL DEFAULT date_trunc('month', now()),
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- projects: extend existing table to match frontend shape
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS user_id        uuid REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS name           text,
    ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'pending'
                                                CHECK (status IN ('pending','generating','done','failed')),
    ADD COLUMN IF NOT EXISTS design_state   jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS thumbnail_url  text,
    ADD COLUMN IF NOT EXISTS share_token    text UNIQUE DEFAULT gen_random_uuid()::text,
    ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- Keep the existing `prompt` column; add `name` as the friendly display title
-- (some older rows may have title instead — copy it over if present)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'title'
    ) THEN
        UPDATE projects SET name = title WHERE name IS NULL AND title IS NOT NULL;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- project_versions: immutable snapshot after each successful generation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_versions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_num  int  NOT NULL DEFAULT 1,
    design_state jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_user        ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_share       ON projects(share_token);
CREATE INDEX IF NOT EXISTS idx_versions_project     ON project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_profiles_id          ON profiles(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_versions  ENABLE ROW LEVEL SECURITY;

-- Service-role key bypasses RLS automatically.
-- These policies allow authenticated users to read/write their own rows.
CREATE POLICY IF NOT EXISTS "users_own_profile"
    ON profiles FOR ALL
    USING (id = auth.uid());

CREATE POLICY IF NOT EXISTS "users_own_projects"
    ON projects FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "users_own_versions"
    ON project_versions FOR ALL
    USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: auto-update projects.updated_at on row change
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: auto-create profile row when a new auth user signs up
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_profile ON auth.users;
CREATE TRIGGER trg_create_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
