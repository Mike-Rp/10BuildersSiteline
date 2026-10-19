# Construction Workforce Dashboard — Angular 21 Migration Architecture

Target stack: **Angular 21 (standalone, signals-first)** + **TailwindCSS** (layout/utility) + **ng-zorro-antd** (component library). No code included — this is the structural and integration blueprint for the migration from the static `construction-workforce-dashboard-v80.html` prototype.

---

## 1. Guiding Decisions

| Decision | Rationale |
|---|---|
| Standalone components only, no NgModules | Angular 21 default; smaller bundles, simpler DI graph, matches the app's already-modular card-based UI |
| Signals for all local/component/UI state | The prototype's state (accounts, activeSites, activityLog, shareLinks, etc.) is plain mutable JS arrays with manual re-render calls — signals replace both the state and the manual `render*()` calls with reactive templates |
| RxJS retained only at the HTTP boundary | `HttpClient` calls, WebSocket/polling for notifications, and debounced search inputs; everything else converted to signals via `toSignal()` |
| NgZorro for structural components | Tables, drawers, modals, steppers, tags, badges already exist 1:1 in the prototype's custom CSS components |
| Tailwind for layout/spacing/custom visual language | The prototype has a distinctive "blueprint" theme (crop marks, mono fonts, custom color tokens) that's easier expressed as Tailwind utilities + a small `theme` extension than fighting ng-zorro's default theme for bespoke bits |
| Role-based route trees, not role-based component branching | Prototype uses one DOM with `role-section-hidden` toggling; Angular version uses four route trees (`/admin`, `/opm`, `/spm`, `/client`) gated by a role guard — clean, lazy-loadable, no dead DOM shipped to the wrong role |

---

## 2. Folder & File Architecture

```
src/
├── app/
│   ├── app.config.ts                     (providers: router, HttpClient+interceptors, ng-zorro icons, NZ_I18N)
│   ├── app.routes.ts                     (top-level: /login, /admin, /opm, /spm, /client, /share/:token)
│   │
│   ├── core/                             (singletons, app-wide concerns — provided in root)
│   │   ├── auth/
│   │   │   ├── auth.service.ts           (login/logout/refresh, currentUser signal)
│   │   │   ├── auth.guard.ts             (functional CanActivateFn)
│   │   │   ├── role.guard.ts             (functional guard, reads route data.role)
│   │   │   └── token.interceptor.ts      (functional HttpInterceptorFn — attaches Bearer token)
│   │   ├── http/
│   │   │   ├── api-error.interceptor.ts  (maps envelope errors → toast + typed error)
│   │   │   └── base-api.service.ts       (thin wrapper: buildUrl, unwraps {data, meta})
│   │   ├── state/
│   │   │   ├── session.store.ts          (signal: currentUser, currentRole, viewAsRole for admin "view as")
│   │   │   └── notifications.store.ts    (signal: activityFeed, unreadCount; polling or WebSocket-fed)
│   │   └── models/                       (shared TS interfaces, 1:1 with API response shapes)
│   │       ├── user.model.ts
│   │       ├── project.model.ts
│   │       ├── subcontractor.model.ts
│   │       ├── document.model.ts
│   │       ├── share-link.model.ts
│   │       └── activity.model.ts
│   │
│   ├── shared/                           (dumb/presentational, reused across roles)
│   │   ├── components/
│   │   │   ├── status-pill/              (maps to .status-pill / .pill-confirmed etc.)
│   │   │   ├── kpi-card/                 (dashboard KPI tiles)
│   │   │   ├── progress-ring/            (score-ring circular %)
│   │   │   ├── stage-stepper/            (wraps nz-steps — intake stepper, phase progress)
│   │   │   ├── notification-bell/        (wraps nz-badge + nz-dropdown, uses notifications.store)
│   │   │   ├── activity-drawer/          (wraps nz-drawer — full activity log)
│   │   │   ├── account-drawer/           (wraps nz-drawer — create/edit account form)
│   │   │   ├── doc-upload-item/          (wraps nz-upload — single document row w/ status)
│   │   │   └── chip-select/              (discipline/project-type/trade multi-select chips)
│   │   ├── pipes/                        (relativeTime, phpDate, sqmFormat)
│   │   └── directives/                   (roleVisible structural directive, alt. to *ngIf for role checks)
│   │
│   ├── layout/
│   │   ├── shell/                        (top bar, role switch [admin-only "view as"], session bar)
│   │   └── sidebar/                      (renders NAV_CONFIG-equivalent per role from route data)
│   │
│   └── features/                         (route-lazy, one folder per NAV_CONFIG section)
│       ├── auth/
│       │   └── login/
│       ├── admin/
│       │   ├── dashboard/                (KPIs, active-sites monitor, schedule performance chart)
│       │   ├── project-intake/
│       │   │   ├── intake-form/          (project details + contract upload)
│       │   │   ├── suggested-allocation/ (OPM match card, per-phase SPM table, headcount)
│       │   │   └── intake-log/
│       │   ├── document-repo/
│       │   │   ├── by-project/
│       │   │   └── by-engineer/
│       │   ├── engineer-directory/
│       │   ├── subcon-directory/
│       │   ├── team-accounts/            (accounts table + account-drawer)
│       │   ├── share-links/
│       │   └── archive/
│       ├── opm/
│       │   ├── dashboard/
│       │   ├── documents/
│       │   ├── confirmation-queue/
│       │   ├── spm-responses/
│       │   └── rework-queue/             (rework + pending progress-update approvals)
│       ├── spm/
│       │   ├── dashboard/
│       │   ├── assignment-request/       (accept/decline + phase-team acceptance)
│       │   ├── active-sites/             (list + detail: history, photos, notes, subcon workers)
│       │   ├── doc-repo/
│       │   ├── subcon-directory/
│       │   └── archive/
│       ├── client/
│       │   └── project-overview/         (single-project read view + client report download)
│       └── public-share/
│           └── share-view/               (resolves /share/:token, no auth)
│
├── styles/
│   ├── tailwind.css                      (@tailwind base/components/utilities + theme tokens: blueprint colors, JetBrains Mono, Barlow Condensed)
│   └── ng-zorro-theme.less               (ant design variable overrides to match the blueprint palette)
└── tailwind.config.js
```

---

## 3. Where Signals Are Used

| Layer | Pattern |
|---|---|
| **Core session state** | `session.store.ts` exposes `currentUser = signal<User\|null>(null)`, `currentRole = computed(() => currentUser()?.role)`, and (admin-only) `viewAsRole = signal<Role\|null>(null)` — the sidebar/shell read `computed()` combinations of these instead of the prototype's manual `applySection()` DOM toggling |
| **Feature list state** | Each feature component (`team-accounts`, `active-sites`, `subcon-directory`, etc.) holds `data = signal<T[]>([])`, populated via `toSignal(this.service.list$(), { initialValue: [] })` or an explicit `effect()` that calls the service and `.set()`s the signal — replacing prototype patterns like `let accounts = [...]` + `renderAccountsTable()` |
| **Derived/filtered views** | `computed()` replaces prototype helper functions like `scopeSummary()`, `subconCertCoverage()`, `isSubconDoubleBooked()`, `pendingUpdateStatusText()` — each becomes a pure `computed(() => ...)` off the relevant signal(s), auto-updating the template with no manual re-render call |
| **Form state** | Angular's typed Reactive Forms remain the source of truth for form fields (intake form, account create/edit, share-link creation); signals are used for *derived* form UI state only — e.g. `canSubmit = computed(() => form.valid() && contractUploaded())`, chip-selection arrays (`selectedDisciplines = signal<string[]>([])`) driving the `chip-select` component instead of manual `classList.toggle` |
| **Notifications / activity feed** | `notifications.store.ts`: `feed = signal<Activity[]>([])`, `unreadCount = computed(() => feed().filter(a => !a.isRead).length)` — badge and drawer both read the same computed, eliminating the prototype's duplicated `renderNotifPanel()` + `renderActivityList()` calls |
| **Multi-step / stepper UI** | Intake stepper and per-phase confirmation status use `signal<StepState>()` per step, or a single `computed()` deriving the active step index from the project's `lifecycleStatus`/`phaseTeam` signals |
| **Real-time-ish updates** (pending-update countdowns, assignment deadline badges) | `signal(Date.now())` updated by an `interval()` piped through `toSignal()`, combined via `computed()` with the deadline timestamp to derive "X days left" text reactively — replaces prototype's `daysUntilAutoApprove()` being recalculated on each manual render |
| **Effects** | Used sparingly, only for side effects with no template consumer: e.g. `effect(() => { if (unreadCount() > 0) updateBrowserTabTitle(); })`, or persisting the admin's "view as" selection to `sessionStorage` |

**Explicitly avoided:** signals are not used to replace `HttpClient` request/response streams themselves — those stay as Observables at the service boundary and are converted to a signal exactly once with `toSignal()` at the point of consumption, keeping retry/error/cancellation logic in RxJS where it's better suited.

---

## 4. HTTP Services — Mapping to API Specification

One injectable, `providedIn: 'root'`, service per resource domain in `02-api-endpoint-specifications.md`, all built on the shared `BaseApiService` (handles envelope unwrapping and typed error mapping):

| Service | Wraps endpoints | Consumed by |
|---|---|---|
| `AuthService` | §1 Auth | login feature, `auth.guard.ts`, `token.interceptor.ts` |
| `AccountsService` | §2 Accounts | `team-accounts`, `account-drawer`, `engineer-directory` (license alerts) |
| `ProjectsService` | §3 Project Intake & Lifecycle | `project-intake/*`, `active-sites`, `client/project-overview`, admin dashboard |
| `ConfirmationsService` | §4 Assignment Confirmations | `confirmation-queue`, `assignment-request`, phase-team acceptance widgets |
| `ProgressService` | §5 Progress & Rework | `active-sites` detail, `rework-queue`, `spm-responses` |
| `SubcontractorsService` | §6 Subcontractors & Workers | `subcon-directory`, `assignment-request` (matching), `pending subcon request` queues |
| `DocumentsService` | §7 Documents & Contracts | `document-repo/*`, `intake-form` contract upload, `spm/doc-repo` |
| `ShareLinksService` | §8 Share Links | `admin/share-links`, `public-share/share-view` |
| `NotificationsService` | §9 Activity Log & Notifications | `notification-bell`, `activity-drawer`, feeds `notifications.store` |
| `DashboardService` | §10 Dashboard / KPI | each role's `dashboard` feature |
| `LookupsService` | §11 Reference Data | resolved once at app init into a `lookups.store.ts` (disciplines, project types, stages, trades, cert types, doc types) — cached signal, never refetched mid-session |

**Integration pattern per service method:**
1. Method returns `Observable<T>` from `HttpClient`, typed against the model in `core/models/`.
2. Feature component (or a thin `*.state.ts` per-feature store, for anything shared across sibling components) calls the service inside a `constructor`/`inject()`-based `effect()` or via `toSignal(service.method$(params), { initialValue })`.
3. Mutating calls (`POST`/`PATCH`/`DELETE`) are triggered from template event handlers, return `Observable<T>`, and on `subscribe()` success call `.update()`/`.set()` on the relevant local signal — no global store refetch needed for single-record mutations (e.g. approving one progress update updates just that item in the `pendingUpdates` signal array).
4. Errors surface through `api-error.interceptor.ts` → a shared `NzMessageService` toast, plus the raw typed error is still returned to the caller for field-level form errors (422 validation responses map to `NzFormControl` error states).

---

## 5. NgZorro Component Mapping

| Prototype element | NgZorro component |
|---|---|
| `.card` / `.card-head` | plain Tailwind card (border, shadow, radius) — no ng-zorro card needed, keeps the "blueprint" crop-mark styling achievable |
| Accounts / Active Sites / Subcon Directory tables | `nz-table` (server-side pagination via `[nzTotal]`, `(nzPageIndexChange)`) |
| `#accountDrawer`, `#activityDrawer` | `nz-drawer` |
| `#addLicenseModal` | `nz-modal` |
| Intake stepper (`#adminStepper`) | `nz-steps` |
| `.status-pill` / `.pill-confirmed` etc. | `nz-tag` with color mapped from status |
| Notification bell + badge | `nz-badge` wrapping an icon button, `nz-dropdown` or the custom `notification-bell` shared component |
| `.chip-select` (disciplines/project types/trades) | `nz-select` with `nzMode="multiple"` and `nzMaxMultipleCount` for the 2-tag OPM cap, or `nz-checkbox-group` styled as chips via Tailwind if the exact chip visual must be preserved |
| Contract/document upload rows | `nz-upload` in manual-upload mode (`nzCustomRequest`) so progress + the "Choose / Upload" two-step UX is preserved |
| Score ring (`.score-ring`) | `nz-progress` in `type="circle"` |
| Schedule performance bar/line charts | `ng2-charts`/`ngx-charts` (not ng-zorro) inside the `dashboard` feature, styled with Tailwind container |
| Escalation / license-alert banners | `nz-alert` |
| Form fields | `nz-form`, `nz-input`, `nz-date-picker`, `nz-select` bound to Reactive Forms |

---

## 6. Routing & Guards

- Root routes: `/login`, `/share/:token` (public), then one lazy-loaded route tree per role: `/admin/**`, `/opm/**`, `/spm/**`, `/client/**`.
- `authGuard` (functional `CanActivateFn`) checks `session.store` for a valid token; redirects to `/login` otherwise.
- `roleGuard` reads `route.data['allowedRoles']` and compares against `session.store.currentRole()` (or `viewAsRole()` for an admin using "view as"); mismatches redirect to that user's own dashboard rather than a generic 403 page, mirroring the prototype's role-switch behavior.
- Each feature's route list mirrors `NAV_CONFIG` 1:1, including the nested "Document Repo → Projects / Engineer Directory" child-route group for admin.
- `client` route tree has a single route (no sidebar sections) matching the prototype's single-anchor client nav.

---

## 7. State Ownership Summary

| State | Owner | Scope |
|---|---|---|
| Current user, role, "view as" | `session.store` | app-wide singleton |
| Notification feed / unread count | `notifications.store` | app-wide singleton, polled or pushed |
| Lookup/reference data | `lookups.store` | app-wide singleton, loaded once |
| Project list / detail, phase team, progress history | `ProjectsService` + local signals in `active-sites`/`project-intake` features | feature-scoped, no cross-feature global store needed since access is already role/project-scoped by the API |
| Accounts table | local signal in `team-accounts` feature | feature-scoped |
| Subcontractor directory & workers | local signal in `subcon-directory` feature, re-used read-only by `assignment-request` via the shared `SubcontractorsService` (each keeps its own signal, no shared mutable store, to avoid one feature's filter state leaking into another) | feature-scoped |
| Share links | local signal in `share-links` feature | feature-scoped |

This keeps the migration close to the prototype's original per-section state shape (`accounts`, `activeSites`, `shareLinks`, `pendingSubconRequests`, `activityLog` were already independent arrays) while replacing manual `render*()` calls with signal-driven templates and manual `fetch`/inline mock data with the typed `HttpClient` services above.
