# Active Sites, completion and Client Portal

## Staff operations

Existing intake and Lead subcontractor workflow state is retained. Active Sites continues to use the seven audited phases: Mobilization, Design, Foundation, Structure, MEP Rough-in, Finishes and Closeout.

- Only the confirmed owner of the current phase can submit progress, issues, checklist evidence, diary notes or site photographs.
- General field notes cannot directly set phase or percentage. Approved QA/QC items drive progress.
- Checklist files require the existing document preset and explicit confirmation. Rejection restores a missing/corrections state and a new submission is required.
- Assigned Office PM ownership and expected versions are checked for reviews. Rework uses the source stage-floor rollback. Rework and QA/QC never auto-approve.
- Handoffs require every current-stage item approved, no unresolved rework, and a named confirmed next owner. Previous owners have read-only completed-phase records.
- Field and checklist evidence remains referenced in internal project history after approval or rejection. Resubmission does not orphan earlier review evidence. Staff previews are still role/project scoped.
- Staff monitoring includes a shared, read-only construction-phase timeline.

## Completion

The earlier implementation stopped at Closeout. The requested post-intake rebuild now implements the source's stated completed-project condition:

1. Closeout is the current phase with a confirmed assigned owner.
2. All required checklist items for tracked construction phases, including Closeout, are approved.
3. No progress or rework review remains unresolved.
4. The project changes to Completed with 100% recorded progress, completion time, visible completion history and a notification.
5. Staff see a completion confirmation and can open Archive. Completed records reject further workflow mutations; authorized views/downloads remain available.

Informational progress notes may resolve through the existing three-day rule; this cannot auto-approve QA/QC or rework. Existing seeded active projects preserve their recorded baseline and track remaining phases; missing historical evidence is not fabricated.

This does not introduce unverified 30-day intake archival, record deletion, or account-retention automation.

## Client Portal

Choose **Ferdinand Uy · Client** in the top-bar Demo session selector. Other active Client accounts are available when their internal setup is completed. This remains simulated account selection, not production authentication.

The portal includes:

- Project Overview, project selector, approved completion and phase information.
- Seven-phase read-only timeline and current activity status.
- Source-supported illustrative Schedule Performance.
- Authorized project document repository with guarded previews and downloads.
- Approved/baseline progress history and text progress-report export.
- Explicitly shared site photographs and primary Office PM/Site PM contact names.
- Client-only approved-update notifications and personal read state.

### Access boundaries

`src/client-access.ts` builds a separate public projection; the Client component does not receive full project records, internal workflow objects, companies, personnel rosters, diary notes, rejection reasons, escalation data, pending updates, or evidence identifiers.

Every read, preview, original-file request and report export requires:

- an active Client account;
- the project's assigned client ID to match that account;
- the project ID in the client's authorized scope;
- an Active or Completed project.

Documents also require an uploaded record, its client-visible flag, and a canonical source-whitelisted type:

1. Notice to Proceed
2. Approved Building Permit
3. Structural & Architectural Plans (Registered)
4. Environmental Compliance Certificate

Budgets, contractual terms, subcontractor agreements, engagement/employment files, QA/QC attachments and unknown types fail closed, even if their client-visible flag is incorrectly set. Authorization uses stored document identity, not a caller-supplied label.

History exports exclude pending/internal entries and explicitly omit all retained staff evidence. Approval of a progress note does not authorize its attachment for the Client.

New gallery uploads are explicitly labeled Client-visible before confirmation. General field evidence and QA/QC attachments remain internal. Earlier gallery records without an explicit sharing flag remain private; they are not silently republished.

The portal exposes no project edit/upload/assignment/approval actions. Client actors are rejected by staff workflow commands. A cached viewer is removed when its project/resource is no longer authorized.

## Honest prototype limits

- Secure authentication, authorization, file serving and cross-user updates require a backend. Browser storage is not a security boundary.
- Schedule graphs are illustrative, separately labeled from approved recorded completion.
- Seed document records have metadata only; actual uploaded files use this browser's IndexedDB.
- Progress export is a text report, not a certified PDF.
- Timers run on opening the app and while it remains open, not on a server.
- Watermarks and hidden download controls are presentation/traceability features, not DRM.
- Public sharing remains excluded.
