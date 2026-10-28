# Trade-based subcontractor allocation

This implementation replaces the one-company intake flow for new projects with an explicit, reviewed company team. Existing contacted, accepted, active and completed allocations remain readable through the legacy flow. No dummy capability approvals or company responses are added to the real directory.

## Allocation policy

### Operating-area eligibility

New company forms require an operating region, province/NCR, and city/municipality. Registration stores this as a **requested** area. Only a Site PM can confirm it in the capability review, using linked company records and a review note. Admin approval does not verify operating areas. Older companies can complete their area in the same Site PM review.

Project intake collects the same structured site fields. The Lead Site PM can complete or update these fields in the allocation screen before any company is contacted. Updating location clears an uncontacted proposal and retains its audit history. Once contact or acceptance exists, and on active projects, site location is locked. A Site PM cannot move a reviewed company area away from a contacted/accepted project that still relies on it.

Project and company locations use the same linked, searchable Region → Province / NCR / independent-city area → City / Municipality dropdowns. Type to filter by name (case/accent insensitive, including Metro Manila/NCR), then click a result or use arrow keys and Enter. An exact full name can also be confirmed on leaving the field. Editing a selected parent immediately clears that selection and its child values; unmatched text never retains a stale city code or becomes an allocated location. Escape closes the suggestion list before closing its surrounding dialog. Options come from a bundled PSGC-derived Q1 2026 snapshot; see `Thesis-Backend/src/domain/data/PHILIPPINE-LOCATIONS.md` for source, version and update limitations. No runtime external lookup is required. NCR and independent cities have separate groups, and Manila's districts do not become separate cities.

New selections store canonical names and an official city/municipality PSGC code. The API validates the parent hierarchy and rejects unknown places, forged codes and mismatched labels. Allocation compares resolved city codes. Existing exact names and documented city/region aliases remain compatible within the recorded region and parent area; arbitrary addresses or fuzzy spelling are never guessed. Unmatched old records remain readable and require explicit reselection before new allocation. Missing project locations or missing Site PM area reviews block new allocation until completed.

The screen and API apply this same rule to automatic teams, manual plans, replacements, contact, acceptance, and activation. Manual selection shows only eligible companies; excluded companies and reasons appear separately. With no complete local team, allocation remains pending. Existing active/legacy records remain readable and no company is silently relocated or reassigned. The two-company/three-company policy and two-project limit remain unchanged. Location and review fields use existing metadata, so no additional migration is required.

| Project type | Required companies |
| --- | --- |
| Residential | 2 |
| Commercial | 3 |
| Mixed-Use | 3 |

Each required discipline in each phase is assigned to one verified company. Several companies can share a phase through different disciplines. One company can cover multiple disciplines and return in nonconsecutive phases. There is no three-discipline limit on company capabilities; the separate engineer scope rule is unchanged.

Site PM reviews supporting company records and explicitly records verified disciplines, availability and a review note in the Site PM workspace. Admin and Office PM capability views are read-only; the API accepts capability edits only from Site PM accounts. The server stamps the actual reviewer and review time. Existing reviews retain their original attribution. Admin still approves company registration. Directory trade/classification and worker roster disciplines remain separate; neither automatically verifies company capabilities. This is an internal capability review, not automated PCAB license verification.

**Suggest Company** now includes grouped proposed company trades. Selections are saved with the registration and shown on directory cards as proposed, with review still required. They do not create a verified capability review or make an unapproved/unreviewed company eligible for allocation. Legacy registrations without proposals remain valid. Admin cannot submit or alter Site PM trade proposals through company registration or the general company update endpoint.

Company forms and directory profiles no longer display available-manpower totals, manpower-list uploads, roster documents, or Excel-template controls. New company submissions do not attach a manpower list. Existing workforce data remains stored for compatibility; this interface change does not delete historical records.

Company registration uses a required **Primary foreman** and an optional **Backup foreman**. Each entered contact needs a full name (up to 150 characters) and an 11-digit mobile number. A blank backup is omitted; entering either backup field requires the other. At most two foremen are accepted by both frontend and API validation. Saved profiles show both contacts with click-to-call links. Contacts are stored in existing company metadata, with the primary contact mirrored into the legacy `contact` and `phone` fields. General company updates preserve the stored foremen. Older generic contacts remain readable without being falsely relabeled as foremen. No additional migration is required for the contact fields.

The Lead Site PM can propose a complete team automatically or choose eligible companies manually, inspect phase coverage, and adjust uncontacted scope. Auto-allocation considers complete verified coverage first and fewer other project commitments next. Stable name/ID ordering resolves equal team rankings. For a single company, the existing eligible company stays on a workload tie. Auto-allocation never contacts or accepts on behalf of a company.

Contact and actual acceptance/decline are manually recorded with details. Contacted and accepted scopes are protected. A declined company can be replaced manually or by Auto-allocate, using exactly the same phase/discipline coverage. Other accepted partners remain unchanged. With no eligible replacement, the plan remains pending and the decline stays in history.

## Capacity and activation

The maximum is two concurrent project commitments per company. Accepted intakes, active company assignments and existing assigned workers contribute to one distinct project count; covering multiple phases counts once. Completed/deleted projects do not consume capacity. Proposed/contacted companies consume no slot. Availability and capacity are rechecked on acceptance and activation under company row locks. A stale allocation revision is rejected.

Acceptance does not activate construction. Activation requires all required companies, complete verified phase coverage, every company acceptance, a signed agreement package covering the selected companies, all six registered documents, all phase-team confirmations, and the existing client-access checks. The new flow creates company assignments without assigning worker numbers or individuals. Foreman/workforce operations remain separate.

Formal release is available to the Lead Site PM only after the project's current phase is beyond the company's last agreed phase. Its slot stays reserved across gaps between returning phases. Normal verified project completion releases remaining assignments. Released scope remains in history; it cannot be reaccepted through the intake response endpoint. Adding new scope to an already active project is not supported by this intake workflow.

Admin, Office PM and other Site PMs can inspect the saved allocation without taking Lead-only actions. Internal capability reviews, scopes and company responses are not included in the client payload. Existing project progress/checklist approval ownership is unchanged.

## Deployment

1. Deploy the updated API and frontend together.
2. Apply `Thesis-Backend/migrations/013-trade-subcontractor-allocation.sql` after the earlier numbered backend migrations, using the normal database migration process. It removes the old unique single-company selection index, preserves existing project policy versions, and defaults new projects to version 1. It is safe to rerun.
3. Restart the API if needed. `/workspace` reports whether the new migration is available. Before it is applied, existing records remain usable and allocation writes return a clear migration-required message.
4. Site PM opens **Subcon directory → View company details & trades → Site PM capability review**. Proposed trades are preselected in the grouped picker. Review existing supporting records or use **Add document**, link the records supporting this review, enter a review note, and choose **Save verified capabilities**. The summary shows review status and selected capability count; the save bar shows selected capabilities and linked documents. Repeat for enough approved companies to cover the configured backend phase disciplines. Use the unavailable checkbox for companies that cannot take new commitments. Admin and Office PM can inspect the saved review without editing it.

The Site PM supporting-document endpoint accepts an approved company or the caller's own pending request. It accepts freshly uploaded, confirmed documents and stores authoritative file metadata; it cannot move documents already linked elsewhere. Retrying the same link does not duplicate records. File size and type checks reuse the existing upload policy, including 10 MB per PDF.

This change does not apply the migration to a running database, seed production companies, or deploy automatically.

## Checking on localhost

Open the normal local SITELINE URL (development default: `http://127.0.0.1:8443/`). After the migration and Site PM capability reviews, create a new intake, accept the Office PM assignment, complete its registered documents, and confirm the Site PM team. An untouched legacy pending intake without contacted/accepted companies can also enter the new flow; already accepted legacy allocations retain their original workflow.

Sign in as the assigned Lead Site PM and open the intake's subcontractor allocation. Propose the required team, inspect coverage, record company contacts and actual responses, and replace a declined company. The two buttons **Review alternatives** and **Auto-allocate** appear together on an uncontacted or declined company. Upload the signed agreement package only once all partners accept. Inspect the saved allocation from the active project's details afterward. Admin and Office PM views are read-only for allocation.

Use accounts actually assigned to the local intake. In a standard disposable dummy-data fixture, Admin is `patricia.domingo@10builders.com`, and Karlo's Lead account is `karlo.espiritu@10builders.com` for Alden Heights. Test fixtures use `Password@123`; real environments may have different credentials. No passwords or users are changed by this implementation.

## Verification

Run `npm test`, `npx tsc --noEmit`, and `npm run build` from the frontend root. New tests cover pure team selection, all project-type counts, multi-discipline/shared/returning scope, capacity, declined replacement, missing coverage, immutable contacted/accepted scopes, failed UI saves, reviewer permissions, real API persistence, duplicate responses, activation of two- and three-company teams, worker-assignment separation, formal release, client privacy and migration reruns.

The backend integration test creates an isolated PGlite database and Express server. It does not connect to the development or hosted database.
