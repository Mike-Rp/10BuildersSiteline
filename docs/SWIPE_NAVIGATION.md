# Workspace swipe navigation

Module navigation uses the existing role-scoped page handlers, not React Router. The shared `useSwipeNavigation` hook calls those same handlers; it does not add browser history entries or alter the sign-out API.

- Right swipe in a module: return to Dashboard. For Clients, Dashboard means Project Overview (shown as Overview in navigation).
- Right swipe on Dashboard: open the existing sign-out confirmation. Cancel keeps the session; only the confirmation button signs out.
- Left swipe on Dashboard: reopen the most recently visited module only if it is still permitted for the same account/session. Left swipes elsewhere do nothing.
- Navigation buttons remain available. A swipe never accepts a form, confirms an appointment, or confirms sign-out.

Gestures start within workspace content, outside interactive controls, forms, horizontal scrolling areas, carousels, sliders, side navigation and open dialogs. Browser-edge gestures (within 24px of either edge) remain browser-owned, so custom navigation cannot fire twice alongside native back/forward. No browser history trapping is used.

A deliberate swipe travels at least 80px horizontally, exceeds vertical travel by 1.7 times, stays within 50px vertical travel, and finishes within 70–900ms. Vertical-first movement, multiple fingers, cancellation, window blur or a changed module/account cancels recognition. Each touch sequence can trigger at most one action.

Changed form fields, inline notes and file inputs receive a conservative leave-page confirmation before swipe navigation. Search/filter controls do not create a dirty form warning. Existing open form dialogs block swipes entirely. Permissions are checked again when confirming navigation; session/account changes clear the remembered destination.

QA covers all four accounts at desktop/mobile layouts, existing sign-out cancellation/confirmation, left/right navigation, repeated ends, rapid separate gestures, excluded controls, horizontal scroll containers, unsaved edits, revoked destinations and unchanged browser history. Automated tests dispatch touch sequences; physical-device browser edge behavior is deliberately left native.
