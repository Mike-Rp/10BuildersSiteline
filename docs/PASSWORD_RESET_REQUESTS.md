# Dashboard password reset requests

The Admin Dashboard switches between Priority items (default) and Password reset requests. Counts remain visible on both tabs. Password-reset notifications open the request tab directly; there is no new sidebar module.

- Unread pending requests have a blue highlight, bold name, dot and text label.
- Opening Review request marks that request read for the current Admin only. It remains pending, with a white row and amber Pending badge.
- Successful reset moves the request to completed history with a green badge. Admin reauthentication, random temporary passwords, session invalidation and mandatory password change are unchanged.
- View all requests provides search, status filtering and pagination. The list includes every pending request and the 20 most recent completed resets.

Read markers are persisted in account metadata and tied to the request timestamp, so a later request from the same account starts unread. Opening a tab or viewing the full list does not mark any request read. Stale review/reset submissions are rejected after another Admin completes the request.

Completion metadata records request time, completion time and the acting Admin, never the temporary password. Completed details cannot reveal or regenerate the previous password. The existing metadata table is used; no migration is needed.
