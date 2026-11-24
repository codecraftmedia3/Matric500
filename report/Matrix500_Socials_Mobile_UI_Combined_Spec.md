# Matrix500 Socials — Mobile UI Update

## Goal
Refine the mobile Socials experience. Keep the existing desktop/PC layout unchanged.

## UI Requirements
1. **Clean header:** Hide the Matrix500 name/logo and remove standalone Admin and Sign Out buttons from the mobile header.
2. **Profile:** Place the compact Profile button in the **top-right corner**. Its menu should contain Profile details, Admin Dashboard (authorized users only), and Sign Out. Reuse existing permissions and sign-out behavior.
3. **Floating navigation:** Show a compact, floating left-side navigation for Home, Search, and Explore, with clear active states and an expand/collapse toggle.
4. **AI action:** Place the existing AI floating component at the **center of the navigation bar**, elevated so it protrudes above and outside the navigation container. Preserve its current functionality and prevent it from covering other controls.
5. **Friends:** Provide a visible compact Friends control that opens the existing friends drawer, including friend search and online status.
6. **Feed priority:** Give the feed most of the available screen space. Keep post content readable, padding comfortable, and official/community labels compact.
7. **Compact controls:** Minimize search until activated. Keep Create Post accessible and preserve title, body, image selection, preview, and removal.
8. **Responsive layout:** Adapt mobile and tablet layouts; prevent overlap and horizontal scrolling. Do not change desktop styling.

## Implementation
- Inspect `index.html`, `app.js`, `socials.js`, and `socials.css` before editing.
- Make targeted changes and reuse existing components and event handlers.
- Keep animations and DOM updates lightweight; preserve accessibility and existing behavior.
- Test multiple mobile widths and confirm desktop remains unchanged.

## Strict Scope
**Frontend UI only.** Do not modify the Node.js server, backend routes, APIs, authentication logic, database, migrations, dependencies, or deployment configuration. Do not change backend behavior.

## Acceptance Checklist
- [ ] Compact header; Profile is top-right with Admin and Sign Out inside.
- [ ] Floating Home/Search/Explore navigation works.
- [ ] AI component floats above the center of the navigation bar.
- [ ] Friends drawer is accessible and functional.
- [ ] Feed is the primary focus; search and composer remain accessible.
- [ ] No overlapping controls or horizontal overflow.
- [ ] Desktop/PC layout and all backend files remain unchanged.
