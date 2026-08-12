-- FlowCAD Supabase Schema
-- Run via: supabase db push  OR  psql -h db.behbsukelneeihajalfh.supabase.co -U postgres -f 001_create_tables.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- projects: one row per design session
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt      text NOT NULL,
    title       text,
    slug        text,
    created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- architectures: block diagram for a project
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS architectures (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
    nodes       jsonb NOT NULL,   -- ArchitectureNode[]
    edges       jsonb NOT NULL,   -- ArchitectureEdge[]
    created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- components: selected BOM for a project
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS components (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
    ref           text NOT NULL,          -- e.g. "U1", "R1"
    name          text NOT NULL,
    footprint     text,
    package       text,
    unit_cost     numeric(10, 4),
    qty           int DEFAULT 1,
    justification text,
    specs         jsonb,                  -- [[key, val], ...]
    created_at    timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- nets: netlist connections
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
    from_ref    text NOT NULL,
    to_ref      text NOT NULL,
    net_name    text NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- verification_results
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_results (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
    checks      jsonb NOT NULL,   -- [{name, status, score, note}, ...]
    confidence  int,              -- 0–100
    drc_note    text,
    created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- boms: BOM snapshot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boms (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
    bom_csv     text NOT NULL,
    total_cost  numeric(10, 4),
    created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- chat_history
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_history (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('user', 'system')),
    content     text NOT NULL,
    created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_architectures_project     ON architectures(project_id);
CREATE INDEX IF NOT EXISTS idx_components_project        ON components(project_id);
CREATE INDEX IF NOT EXISTS idx_nets_project              ON nets(project_id);
CREATE INDEX IF NOT EXISTS idx_verification_project      ON verification_results(project_id);
CREATE INDEX IF NOT EXISTS idx_boms_project              ON boms(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_project      ON chat_history(project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (disable for service-role key access)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE architectures      ENABLE ROW LEVEL SECURITY;
ALTER TABLE components         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE boms               ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history       ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend uses service key)
CREATE POLICY "service_role_all" ON projects           FOR ALL USING (true);
CREATE POLICY "service_role_all" ON architectures      FOR ALL USING (true);
CREATE POLICY "service_role_all" ON components         FOR ALL USING (true);
CREATE POLICY "service_role_all" ON nets               FOR ALL USING (true);
CREATE POLICY "service_role_all" ON verification_results FOR ALL USING (true);
CREATE POLICY "service_role_all" ON boms               FOR ALL USING (true);
CREATE POLICY "service_role_all" ON chat_history       FOR ALL USING (true);
