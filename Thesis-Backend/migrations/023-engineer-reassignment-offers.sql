-- Per-responsibility response windows. Existing offer dates are not reconstructed.
alter table public.project_phase_responsibilities
  add column if not exists offer_started_at timestamptz,
  add column if not exists offer_deadline_at timestamptz;
