# Audit paused at user request
Application changes are being published separately. Do not commit this scratch directory.
No application code was changed during the audit; no hosted database writes were performed.
Read docs/HANDOFF_FOR_CLAUDE_CODE.md and current backend docs. The handoff is stale.
Existing suites: frontend/database 224 pass, backend 77 pass, strict tsc passes. pnpm build unavailable because pnpm is not installed; Vite build succeeds with the existing warnings.
All six role UI smoke runs passed. Real-browser outage restoration displayed Retry; sampled mobile Site PM targets met 48px, but text below 14px remains.
Bulk sweep: 316 accounts (50 Admin, 120 OPM, 121 SPM including one declined-only probe, 25 Client); one workspace scope mismatch on the declined-only SPM.
Read-only deployed health and SPA requests returned 200; no hosted login or workflow requests were made.
See alternate-results.json: 43 checks, 29 recorded FAIL expectations. These are audit findings, separate from passing test-runner assertions.
Critical local reproductions include unauthenticated legacy license writes/reads and unauthenticated contract replacement deleting an original record.
Other findings include expired token refresh, server-side lockout absent, pending-project client disclosure, missing workflow gates and expectedVersion enforcement, OPM activation actor mismatch, multiple-company allocation through alternate API, invalid dates/legacy types accepted, missing type/cooldown/cap eligibility checks.
Resume by reviewing stored evidence and collecting final line references. The requested full report has not been delivered yet.
Artifacts: static-results.json; probe-results.json; request-metrics.json; alternate-results.json; alternate-metrics.json; scope-browser-results.json; deployment-results.json; sanitized *.log; two screenshots.
