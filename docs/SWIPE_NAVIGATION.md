# Workspace swipe navigation

Module navigation uses the existing role-scoped page handlers, not React Router. The shared `useSwipeNavigation` hook calls those same handlers; it does not add browser history entries or alter the sign-out API.

- Right swipe in a module: return to Dashboard. For Clients, Dashboard means Project Overview (shown as Overview in navigation).
- Right swipe on Dashboard: open the existing sign-out confirmation. Cancel keeps the session; only the confirmation button signs out.
- Left swipe on Dashboard: reopen the most recently visited module only if it is still permitted for the same account/session. Left swipes elsewhere do nothing.
- Navigation buttons remain available. A swipe never accepts a form, confirms an appointment, or confirms sign-out.

Gestures start within workspace content, outside inputs, links, forms, horizontal scrolling areas, carousels, sliders, side navigation and open dialogs. Browser-edge gestures (within 24px of either edge) remain browser-owned, so custom navigation cannot fire twice alongside native back/forward. No browser history trapping is used.

A deliberate touchscreen swipe travels at least 64px horizontally, exceeds vertical travel by 1.5 times, stays within 70px vertical travel, and finishes within 30–1500ms. Mouse drags use the same distance checks with up to 2500ms for the drag. Vertical-first movement, multiple fingers, cancellation, window blur or a changed module/account cancels recognition. Each touch or mouse sequence can trigger at most one action. Swipes may start on card buttons; a recognized drag suppresses the resulting click, while ordinary taps and clicks keep their original behavior.

Changed form fields, inline notes and file inputs receive a conservative leave-page confirmation before swipe navigation. Search/filter controls do not create a dirty form warning. Existing open form dialogs block swipes entirely. Permissions are checked again when confirming navigation; session/account changes clear the remembered destination.

QA covers all four accounts at desktop/mobile layouts, existing sign-out cancellation/confirmation, left/right navigation, repeated ends, rapid separate gestures, excluded controls, horizontal scroll containers, unsaved edits, revoked destinations and unchanged browser history. Automated tests dispatch touch, pointer and wheel sequences; physical-device browser edge behavior is deliberately left native.

Horizontal touchpad/wheel input is accumulated as one stream, including momentum, and evaluated after 220ms of quiet. It needs at least 100px of horizontal movement and must dominate vertical scrolling. Pinch gestures, vertical scrolling and horizontal scroll containers are excluded. The content-movement direction is used, matching natural trackpad scrolling.

## Dialog and browser navigation protection

While a workspace is active, horizontal overscroll is disabled on the document
root and body, including the modal/backdrop outside main-shell. While a dialog
is open, cancelable horizontal touch and wheel gestures outside horizontal
scroll containers are consumed without performing any application action.
Vertical scrolling, pinch gestures and horizontal lists remain available.
Opening a dialog cancels any in-progress gesture or queued wheel navigation;
closing it does not resume that gesture. Styles and listeners are restored
when the workspace is disabled or unmounted.

The prior handler ignored dialog input but only contained overscroll on the
workspace surface. Regression tests reproduce the unhandled horizontal dialog
and backdrop events before the fix. Browser Back can reveal a login route
without clearing a session; the sign-out callback still requires explicit
confirmation. No history entries, popstate traps or Back-button interception
were added. Browser/OS gestures that are not cancelable remain browser-controlled;
automated DOM tests do not prove physical-device edge-gesture behavior.
