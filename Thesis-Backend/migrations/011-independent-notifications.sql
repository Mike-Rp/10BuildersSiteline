-- Run through scripts/migrate-notifications.js. It defaults to a rolled-back dry run.
-- No legacy rows or log entries are edited or removed.
CREATE TABLE IF NOT EXISTS public.notifications (
  id bigserial PRIMARY KEY,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  link text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  related_project_id uuid REFERENCES public.projects(id),
  activity_log_id bigint REFERENCES public.activity_log(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  resolved_reason text,
  subject_type text,
  subject_id text,
  legacy_key text,
  legacy_snapshot jsonb,
  CONSTRAINT notifications_subject_pair CHECK ((subject_type IS NULL) = (subject_id IS NULL)),
  CONSTRAINT notifications_internal_link CHECK (link IS NULL OR (link ~ '^/[a-zA-Z0-9]' AND link !~ '[\\[:space:][:cntrl:]]')),
  CONSTRAINT notifications_legacy_recipient UNIQUE (recipient_user_id, legacy_key)
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created ON public.notifications(recipient_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread ON public.notifications(recipient_user_id) WHERE read_at IS NULL AND dismissed_at IS NULL AND resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_activity ON public.notifications(activity_log_id);
CREATE INDEX IF NOT EXISTS notifications_project ON public.notifications(related_project_id);
CREATE INDEX IF NOT EXISTS notifications_open_subject ON public.notifications(subject_type, subject_id) WHERE resolved_at IS NULL;

-- Preference changes must no longer create business audit records. Historical audit rows stay.
DROP TRIGGER IF EXISTS trg_audit_notification_recipients ON public.notification_recipients;
-- Deliberately no audit trigger on notifications.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.notifications_id_seq FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.notifications FROM anon;
    REVOKE ALL ON SEQUENCE public.notifications_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.notifications FROM authenticated;
    REVOKE ALL ON SEQUENCE public.notifications_id_seq FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON public.notifications TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE public.notifications_id_seq TO service_role;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_service') THEN
      CREATE POLICY notifications_service ON public.notifications TO service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

INSERT INTO public.notifications
 (recipient_user_id,type,title,message,related_project_id,activity_log_id,created_at,read_at,legacy_key,legacy_snapshot)
SELECT n.recipient_user_id,t.code,a.title,coalesce(a.detail,''),a.related_project_id,a.id,
 coalesce(n.created_at,a.occurred_at),
 CASE WHEN n.is_read THEN coalesce(n.read_at,n.updated_at,n.created_at,a.occurred_at) END,
 'activity:'||a.id,
 jsonb_build_object('is_read',n.is_read,'read_at',n.read_at,'detail',a.detail,'created_at',n.created_at)
FROM public.notification_recipients n
JOIN public.activity_log a ON a.id=n.activity_log_id
JOIN public.activity_types t ON t.id=a.activity_type_id
ON CONFLICT (recipient_user_id,legacy_key) DO NOTHING;
