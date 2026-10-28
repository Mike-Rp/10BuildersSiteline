# Construction Daylight

SITELINE uses a shared, code-based visual foundation across Administrator, Office PM, Site PM and Client workspaces. This redesign changes presentation only; domain rules, record persistence, role authorization, document visibility and workflow transitions remain in their existing modules.

## Files

- `src/index.css`: Tailwind entrypoint, existing responsive component layouts and Inter wiring. Legacy small-text declarations and pale foregrounds are normalized.
- `src/construction-daylight.css`: semantic tokens and the shared visual foundation, loaded after the base stylesheet from `src/main.tsx`.
- `src/ui.tsx`: existing shared controls. Their public interfaces and action handlers are unchanged.
- `Chart` in `src/panels.tsx`: unchanged data series and calculations, with a measured SVG coordinate space so 14px labels remain readable when the chart narrows.

## Palette

| Token | Value | Purpose |
|---|---|---|
| Canvas | `#F5F6F3` | Application background |
| Surface | `#FFFFFF` | Cards, forms and dialogs |
| Ink | `#17221D` | Primary text and headings |
| Secondary | `#475569` | Descriptions, metadata and helper text |
| Primary | `#245C45` | Main actions and current navigation |
| Success | `#166534` | Verified, accepted and completed states |
| Warning | `#B45309` | Pending work and attention |
| Error | `#B42318` | Validation errors and destructive actions |
| Border | `#D8DED9` | Structural separators |

Complementary pale status surfaces and a stronger neutral input border support contrast. Status labels and icons remain visible; color is never the only status indicator.

## Typography and structure

- Inter is the primary font, retaining the existing Google Fonts setup.
- Visible text is at least 14px. Body copy uses 16px; headings and tabular metrics establish hierarchy without shrinking metadata.
- Flat white surfaces, precise rules, restrained six-to-eight-pixel corners and consistent spacing replace decorative floating cards.
- Sidebar navigation scrolls independently so profile/session controls remain visible. Tablet and mobile screens use the existing navigation drawer.
- Tables retain all columns and actions, with contained horizontal scrolling on small screens rather than tiny text.
- Dialogs use opaque white surfaces, clear headers, readable labels and a strong action hierarchy. No glassmorphism or decorative gradients.

## Outdoor Site PM use

- Mobile controls have 48px touch heights, with 44px icon widths and 16px inputs.
- High-contrast text and visible focus outlines are consistent across forms, checklists, issue chips, assignments and evidence confirmations.
- Layouts stack at narrow widths; workflow prerequisites and disabled states remain explicit.
- Responsive charts preserve real 14px label geometry rather than scaling down a fixed desktop graphic.
- Reduced-motion preferences are respected.

Photography remains real uploaded project data. No stock imagery or construction-themed illustration is introduced as project evidence.

## Verification

The design token tests check the exact palette, minimum declared font sizes, global stylesheet wiring and mobile targets. Browser checks cover all four roles, their module pages, intake dialogs, readable chart labels, navigation drawers and viewport containment down to 320px. Existing business-rule and workflow regression tests remain the authority for functionality.
