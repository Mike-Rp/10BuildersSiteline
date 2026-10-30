# Session inactivity

All roles use a server-enforced 30-minute inactivity deadline, with a warning
five minutes before the deadline and an explicit **Stay signed in** action.
The original eight-hour JWT expiry remains an absolute upper limit; refresh
does not extend it.

The browser reports deliberate trusted pointer, keyboard, touch and wheel
input at most once every 15 seconds. Automatic polling, focus, visibility changes,
programmatic scrolling and session-status reads do not renew activity. Warning
interaction only renews the session through the Stay signed in button. No drafts
are cleared by the warning, but unsaved changes can be lost after expiration.
Resuming a sleeping/background tab rechecks its deadline. The server revalidates
the session inside the activity transaction before accepting continuation.

Server timestamps and the current JWT session ID are stored under sessionActivity
in workspace_account_metadata. No migration is required. Existing sessions with
no matching activity record use their verified JWT issuance time, never a new
30-minute allowance on every request. Expired sessions remain unusable even when
the browser is closed. A new successful login replaces stale metadata.

After validating credentials and the login portal, sign-in checks whether the
stored session is both JWT-valid and within its inactivity deadline. Only a
recent session triggers the existing-session choice, with minutes since activity.
Cancel leaves it untouched; explicit continuation replaces it. Previous devices
are rejected on their next authenticated request. There is still only one stored
session per account. Recent activity is not proof of a physically present person.

GET /auth/session reads deadlines. POST /auth/activity records activity using
server time; client-provided timestamps are ignored. Idle expiration is checked
centrally on authenticated requests and returns SESSION_INACTIVE. The frontend
clears that session and shows the inactivity explanation through the existing
session-ended mechanism.
