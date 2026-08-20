ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS name text;

UPDATE public.projects SET name = title WHERE name IS NULL;

INSERT INTO public.profiles (id, email, full_name)
VALUES ('00000000-0000-0000-0000-000000000000', 'dev@local', 'Dev User')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.project_versions
  DROP CONSTRAINT IF EXISTS project_versions_project_id_fkey;

ALTER TABLE public.project_versions
  ADD CONSTRAINT project_versions_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;