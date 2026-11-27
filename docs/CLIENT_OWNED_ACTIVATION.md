# Client-owned activation — local staged implementation

This feature is **disabled by default**. The configured database has not been
migrated. Do not enable it against production or reuse real client data for tests.

## Enable only after database approval

1. Review `Thesis-Backend/migrations/044-client-owned-activation.sql`. It adds two
   tables, without changing users, passwords, or existing project links.
2. Obtain approval before applying it to the intended local/test database.
3. In `Thesis-Backend/.env`, set `CLIENT_OWNED_ACTIVATION=true` and
   `CLIENT_VERIFICATION_MAIL_URL=http://127.0.0.1:8026/capture`.
4. Run `node scripts/local-verification-mail.js` from `Thesis-Backend` and restart
   the development backend. The server binds loopback only. Verification messages
   appear as `.eml` files in the git-ignored `Thesis-Backend/.local-mail/` directory.
   Treat them as temporary test secrets. No messages reach real inboxes.
5. Use isolated test inquiries and email addresses. Create a new project invitation,
   confirm the intended recipient in the OPM account panel, and issue the code.
6. Open `/client/activate` on the client portal. Supply a client-chosen login email
   and password. Read the local captured verification messages and enter both codes.
   When the contact and login emails are identical, one code verifies both.
7. Sign in using the chosen email/password. An existing signed-in client can use
   Preferences → Link another project without changing their password.

The local-only flag rejects production/Vercel enablement. A real email transport,
distributed abuse controls, operational retention, and deployment security review
are separate work; this implementation must not be presented as production-ready.

## Authorization and compatibility

- Inquiry `email` remains the contact email for communication and validation. New
  invitations do not create users or link projects from that address alone.
- The OPM attests to recipient identity before issuance. The code is random,
  hashed, expires after 24 hours, and becomes unusable after redemption/reissue.
- Possession of the invitation is insufficient. A separate code sent to the
  authorized project contact verifies the recipient. A second code verifies the
  chosen login email. Verification lasts 15 minutes and allows five failed attempts.
- Five verification starts per invitation per hour are allowed. IP/email middleware
  also throttles failed requests. Passwords are bcrypt hashes; cleartext passwords
  are neither mailed nor returned to staff.
- Database row locks and email advisory locks guard redemption and email races.
  Links are written only after verification; existing user credentials and other
  links are preserved. Expired/failed pending records confer no access.
- Existing users and old pending-account codes remain on the legacy flow. The
  activation page provides an explicit earlier-code option. Nothing migrates old
  accounts or asserts that their emails were verified by this new flow.
- Existing active accounts are not automatically linked by an inquiry email match.
  New invitation projects reject staff recovery/link-by-email endpoints. New staff
  account responses show contact email and activation state, not private login email.

## Verification commands

From the repository root:

```
npm run build
node --experimental-strip-types --test tests/client-owned-activation-ui.test.mjs tests/project-client-account-ui.test.mjs
```

From `Thesis-Backend`:

```
node --experimental-test-module-mocks --test tests/client-owned-activation.test.js tests/client-onboarding.test.js
```

Backend tests apply the migration only inside disposable in-memory PGlite. They
do not connect to `.env`'s database. They cover independent email ownership,
recipient proof, bad/expired/reissued/used codes, persisted attempt limits,
delivery failure rollback, account collisions, and additional-project linking.
