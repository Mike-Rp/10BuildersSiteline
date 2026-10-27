# Trade-based subcontractor allocation

This implementation replaces the one-company intake flow for new projects with an explicit, reviewed company team. Existing contacted, accepted, active and completed allocations remain readable through the legacy flow. No dummy capability approvals or company responses are added to the real directory.

## Allocation policy

| Project type | Required companies |
| --- | --- |
| Residential | 2 |
| Commercial | 3 |
| Mixed-Use | 3 |

Each required discipline in each phase is assigned to one verified company. Several companies can share a phase through different disciplines. One company can cover multiple disciplines and return in nonconsecutive phases. There is no three-discipline limit on company capabilities; the separate engineer scope rule is unchanged.

Site PM reviews supporting company records and explicitly records verified disciplines, availability and a review note in the Site PM workspace. Admin and Office PM capability views are read-only; the API accepts capability edits only from Site PM accounts. The server stamps the actual reviewer and review time. Existing reviews retain their original attribution. Admin still approves company registration. Directory trade/classification and worker roster disciplines remain separate; neither automatically verifies company capabilities. This is an internal capability review, not automated PCAB license verification.

**Suggest Company** now includes grouped proposed company trades. Selections are saved with the registration and shown on directory cards as proposed, with review still required. They do not create a verified capability review or make an unapproved/unreviewed company eligible for allocation. Legacy registrations without proposals remain valid. Admin cannot submit or alter Site PM trade proposals through company registration or the general company update endpoint.

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
