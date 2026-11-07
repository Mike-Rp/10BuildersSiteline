-- Explicit units avoid reinterpreting existing numeric year values as months.
-- Safe to rerun: already converted {"months": ...} entries are retained.
UPDATE public.workspace_account_metadata AS m
SET metadata = jsonb_set(m.metadata, '{experienceByType}', (
  SELECT jsonb_object_agg(e.key, CASE
    WHEN e.key IN ('Residential', 'Commercial', 'Mixed-Use')
      AND jsonb_typeof(e.value) = 'number'
      AND e.value::text ~ '^([0-7]?[0-9]|80)$'
    THEN jsonb_build_object('months', (e.value::text)::integer * 12)
    ELSE e.value END)
  FROM jsonb_each(CASE WHEN jsonb_typeof(m.metadata->'experienceByType') = 'object' THEN m.metadata->'experienceByType' ELSE '{}'::jsonb END) AS e
))
WHERE jsonb_typeof(m.metadata->'experienceByType') = 'object'
  AND EXISTS (
    SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(m.metadata->'experienceByType') = 'object' THEN m.metadata->'experienceByType' ELSE '{}'::jsonb END) AS e
    WHERE e.key IN ('Residential', 'Commercial', 'Mixed-Use')
      AND jsonb_typeof(e.value) = 'number'
      AND e.value::text ~ '^([0-7]?[0-9]|80)$'
  );
