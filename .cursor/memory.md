# Project Memory (Dev & Architecture)

Persistent memory for development, tooling, and system architecture learnings.
For document content corrections, see `src/sources/corrections.md` and `.cursor/corrections.md`.

---

## Corrections

| Date | Source | What Went Wrong | What To Do Instead |
| -- | -- | -- | -- |

## Dev Preferences

- **Cursor hooks**: When asked to create or add hooks, add the script under `.cursor/hooks/` and register it in `.cursor/hooks.json` (project-level hooks). Use the same pattern as existing hooks: Node scripts reading JSON from stdin, `workspace_roots` for repo root, commands like `node hooks/<name>.js`.
- **Ingest protection**: No protection modes (safe/normal/force). Ingest is protected by `.cursor/hooks/revert-ingest-if-edited.js`: on afterFileEdit it aborts immediately unless the edited path is under `src/ingest/` and not manifest; then it reverts modified non-manifest files there and writes next-step.md. No scripts for users to run.

## Patterns That Work

- **Media in ingest/update-docs**: Image and audio URLs in ingest content are downloaded to `public/media/YYYY-MM-DD_slug/` with `meta.json`; video URLs are kept as-is. Sources reference downloaded media as repo-root links or external video URLs. `mdx-components.tsx` uses Fumadocs `ImageZoom` for images, and new `<AudioPlayer>` and `<VideoPlayer>` components for audio/video, with offline awareness.

## Patterns That Don't Work

*(None yet.)*

## Environment Notes

- **`window` / TypeScript in this repo**: `app/sw.ts` has `/// <reference lib="webworker" />`. Because that file is included in the main tsconfig via `**/*.ts`, the webworker lib is applied to the whole program and `window` is not in scope for other files (e.g. client components). **Fix**: exclude `app/sw.ts` from `tsconfig.json` `exclude`. The SW is built by esbuild (Serwist), not by the main TS build, so excluding it is safe.
- **Offline detection in client components**: Prefer React’s `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` for `navigator.onLine` (and similar browser state). It’s SSR-safe and avoids direct `window` use during render; use a server snapshot that returns a safe default (e.g. `true` for “online”).
- **Repo tooling**: No `LS` tool is available in this environment; use `Glob` to enumerate directories/files when you need a “list directory” view.
