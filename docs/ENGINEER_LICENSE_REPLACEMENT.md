# Engineer license replacement policy

This is an internal company access policy, not a claim that a PRC license expires early. Dates use Asia/Manila calendar days.

| Days remaining on the current license | Behavior |
| --- | --- |
| More than 33 | Normal workspace access, subject to existing qualifications and assignment rules. |
| 33 through 31 | Notify Admin and the engineer. Admin can prepare a replacement and view candidates' names, phone numbers and emails. |
| 30 through 24 | No new assignments. Seven calendar days of viewing-only workspace access; project mutations are rejected by the server. |
| 23 or fewer | Normal workspace access and sign-in are blocked with instructions to contact Admin. The account, work and history are retained. |

Admin opens **Prepare replacement** from the Dashboard, project assignments or engineer profile. Candidates must have an uploaded license with more than 30 days remaining, no assignment hold, matching qualifications and available capacity.

After contacting the incoming engineer, Admin confirms the project-specific appointment was signed at the office and records the actual signing date. **Approve & switch engineer** immediately transfers the assignment, including the Lead designation if relevant. This can happen at day 33, before the day-30 notice. The replacement does not accept inside the system. Opening the form does not change the assignment. Stale submissions are rejected if the holder has changed.

The existing `license_overrides` record stores Admin attribution, approval time and the office-signing confirmation/date. Assignment history closes the outgoing contribution and records the new holder. Existing activity, evidence, approvals and pending reviews remain intact. No database migration is needed for this change.

An unverified renewal does not lift restrictions. Admin submits and verifies renewals through the existing license review flow. Verification restores eligible access based on the renewed expiry; it never restores assignments already transferred to another engineer. Normal workspace access is blocked by policy rather than changing the user's HR account status to suspended.

The maintenance sweep notifies both parties at preparation/viewing/restriction stages and flags Admin for each assignment still needing replacement. Notices are deduplicated per engineer, expiry and project/stage. The Dashboard continues to show unresolved replacements even if a reminder has already been read.
