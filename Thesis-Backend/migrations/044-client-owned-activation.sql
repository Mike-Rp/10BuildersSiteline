-- Additive only. Do not run against a live database without approval.
CREATE TABLE IF NOT EXISTS client_portal_invitations (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id),
  contact_email text NOT NULL,
  client_name text NOT NULL,
  code_hash text UNIQUE,
  expires_at timestamptz,
  recipient_verified_by uuid REFERENCES users(id),
  recipient_verified_at timestamptz,
  redeemed_by uuid REFERENCES users(id),
  redeemed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((redeemed_by IS NULL) = (redeemed_at IS NULL))
);
CREATE TABLE IF NOT EXISTS client_portal_verifications (
  id uuid PRIMARY KEY,
  invitation_id uuid NOT NULL REFERENCES client_portal_invitations(id),
  login_email text NOT NULL,
  password_hash text,
  existing_user_id uuid REFERENCES users(id),
  recipient_hash text NOT NULL,
  email_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  delivery_ready boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((password_hash IS NOT NULL) <> (existing_user_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS client_portal_verification_invitation_idx
  ON client_portal_verifications(invitation_id,created_at);
-- Only the trusted backend accesses these tables. No browser role gets policies.
ALTER TABLE client_portal_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON client_portal_invitations,client_portal_verifications FROM PUBLIC;
