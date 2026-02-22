---
name: Offline show real page
overview: Replace the full-page "You are offline" message with a subtle top-right offline badge, use the home page as the document fallback when a page isn't cached, and remove the dedicated offline page.
todos:
  - id: sw-fallback-to-home
    content: Change SW document fallback from /~offline to / in app/sw.ts
  - id: remove-offline-precast
    content: Remove /~offline from additionalPrecacheEntries in app/serwist/[path]/route.ts
  - id: offline-badge-component
    content: Add OfflineBadge client component (top-right, subtle) and mount in root layout
  - id: remove-offline-route
    content: Remove app/(routes)/~offline/ page and route
---
# Offline: badge instead of full-page message

## Goal

- User should **not** see a full-page "You are offline" message with no way to close it.
- Show a **subtle "(offline)" badge in the top right** when the user is offline—non-intrusive indicator only.
- When a document isn't cached offline, serve the **home page** (so the app still loads and the badge can show) instead of the dedicated offline page.

## Changes

### 1. Service worker: fallback to home instead of offline page

**File:** [app/sw.ts](app/sw.ts)

- In the `fallbacks.entries` document matcher, change `url: "/~offline"` to `url: "/"`.
- So when the SW can't serve the requested document (cache miss + offline), it serves the precached home page. The user sees the app (home) with the offline badge, not a dead-end message.

### 2. Serwist route: stop precaching the offline page

**File:** [app/serwist/[path]/route.ts](app/serwist/[path]/route.ts)

- Remove `{ url: "/~offline", revision }` from `additionalPrecacheEntries` (or replace with entries that include `"/"` if not already there from the prior precache work).
- Ensure `"/"` is in the precache list so the new document fallback works.

### 3. Offline badge component and layout

**New:** A small client component (e.g. `app/offline-badge.tsx` or under `app/components/`).

- Use `navigator.onLine` and the `online` / `offline` window events to track offline state.
- When offline, render a small, non-intrusive badge in the **top right** (e.g. fixed position), e.g. text "(offline)" with muted styling (small font, subtle color so it's an indicator, not a banner).
- **Mount this component in the root layout** ([app/layout.tsx](app/layout.tsx)) so it appears on every page (e.g. inside `<body>`, after or inside `RootProvider`/`SerwistProvider`). It should not block or overlay the main content in a heavy way.

### 4. Remove the dedicated offline page

- **Delete** the route and page at [app/(routes)/~offline/page.tsx](app/(routes)/~offline/page.tsx) (and remove the directory if nothing else lives there).
- No other references to `/~offline` should remain after the SW and Serwist route updates above.

## Summary

| What | Where |
|------|--------|
| Fallback URL: `/~offline` → `"/"` | [app/sw.ts](app/sw.ts) |
| Remove `/~offline` from precache; ensure `"/"` precached | [app/serwist/[path]/route.ts](app/serwist/[path]/route.ts) |
| Add OfflineBadge client component (top-right, subtle) | New file, e.g. `app/offline-badge.tsx` |
| Mount OfflineBadge in root layout | [app/layout.tsx](app/layout.tsx) |
| Remove `~offline` page and route | Delete [app/(routes)/~offline/page.tsx](app/(routes)/~offline/page.tsx) |

Result: when the user goes offline they see the normal app with a small "(offline)" badge in the top right; if they hit a document that isn't cached, they get the home page with the same badge instead of a full-page message.
