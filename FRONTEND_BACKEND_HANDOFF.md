# Frontend fixes and backend handoff

- ADM-ARCH-003: Frontend API client blocks ordinary project DELETE requests. No project deletion button exists in the current UI. Backend must reject active-project deletion and enforce archive eligibility.
- SHR-NOT-007: Recommendation requests require a session token in the frontend. All authenticated 401 responses now clear the session and notify the app. Backend must authenticate every recommendation endpoint.
- SHR-NOT-008: Temporary-password sessions display password reset without loading workspace data. Frontend blocks other API requests until reset succeeds, then re-verifies the session. Backend must enforce the restriction for every protected endpoint.
- ADM-INT-011 / WF-INT-002: Resubmission workspace payload clears OPM acceptance timestamp and team confirmations. Backend intake transaction must invalidate the former OPM confirmation and issue a fresh pending confirmation to the replacement OPM; frontend cannot repair stale database confirmation records.
- SPM-DASH-004: Engineer responsibility acceptance now uses the same prerequisite checks as assignment acceptance, both on the button and in its action handler. Backend must enforce OPM acceptance, six registered documents, and lead-first acceptance.
- ADM-ALLOC-005: Frontend validation and helper text allow at least 50% coverage for every phase, rounded up; 2 of 3 passes. Backend engineer-phase-coverage policy still uses the old quota for phases below five tags and must be updated. Existing backend suggestion logic remains in use and prefers full coverage.

Backend source files were not modified. Production build and focused regression tests are run locally; live-site behavior is not verified.
