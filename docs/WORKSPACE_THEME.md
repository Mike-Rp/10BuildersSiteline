# Light workspace theme

The approved white-sidebar layout is shared by Administrator, Office PM, Site PM
and Client. `workspace-theme.css` loads after the existing construction stylesheet
and scopes its tokens and rules to `.app-shell`. Login screens retain their own
design. Main navigation, the sticky header, controls, tables and workspace panels
use navy, white, light blue and the existing semantic status colors.

The sidebar retains each role's existing destinations and alternating open/close
controls. Compact navigation continues to use the existing 1000px breakpoint.
Mobile cards and monitoring columns stack rather than widening the page. Existing
reports, exports, forms, approval controls and authorization remain in place.

Admin/OPM/SPM project dialogs use `ProjectMonitoringOverview` to present actual
project records, existing phase sequence, assigned personnel and accepted company
details. The overall bar still requires trusted project-wide approved totals;
cached phase progress is never used as a substitute. Photos load through the
existing authenticated file endpoint. Missing photos and totals have honest empty
states. Detailed assignment, document, evidence and review actions remain below
the overview in their existing authorized flows.

Client Overview uses only `ClientProjectView`: shared photos, existing project
highlights, public project facts, latest shared update and project contacts. It
does not receive the staff overview component, private diary, company verification
records or staff review controls, and does not reintroduce the removed Client
phase timeline navigation.

Verification covers all-role sidebar/navigation and sign-out behavior, Client
visibility and progress safeguards, project progress nested dialogs, dashboard
reports, and monitoring empty states. Responsive browser checks use fixture data,
not live project mutations. Preview scripts and screenshots are review aids and
are not production dependencies.
