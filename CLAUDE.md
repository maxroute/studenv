# CLAUDE.md — Studenv

Permanent engineering instructions for Claude working in this repository.
These rules override default behavior. When a rule here conflicts with convenience, follow the rule.

---

## 0. Non-negotiable rules (read first)

1. **Never commit, push, merge, rebase onto shared branches, open/merge PRs, or deploy without the user's explicit approval for that specific action.** Approval for one action does not extend to the next.
2. **Never run destructive commands or database migrations/seeds without first explaining exactly what they will do, which database they target, and getting explicit approval.**
3. **Inspect the complete affected flow before changing code.** Trace from UI event → store → API route → service → repository → Prisma (or the equivalent path) before editing.
4. **Identify and explain the root cause before implementing a fix.** No speculative patches.
5. **No superficial patches, no unrelated refactoring.** Change only what the task requires.
6. **Preserve existing desktop, mobile, pen and touch interactions.** Every workspace/canvas change must follow §4.
7. **Never weaken, delete, skip or loosen tests to make an implementation pass.** If a test is genuinely wrong, explain why and get approval before changing it.
8. **After changes, run the appropriate tests, type check, lint and production build**, and report results faithfully — including failures.
9. **Never expose secrets** (`.env*` values, `keyfile`, `ok`, `*.pem`, tokens, credentials, full connection URLs) in output, logs, commits or requests. Safe programmatic inspection that reveals only key names or redacted hosts is allowed (see §12).
10. **Verify this document against the actual implementation before relying on it.** If CLAUDE.md and the code disagree, the code is the source of truth — report the discrepancy to the user (see §13).

### 0.1 Actions that always require explicit approval

Ask first, explain the impact, and wait for a clear "yes" before any of the following:

- **Git:** commit, push, merge, rebase, cherry-pick, force-push, reset, branch create/delete, tag, stash drop, opening or merging PRs, enabling auto-merge.
- **Deployment:** any deploy, release, or production-mode publishing step.
- **Destructive commands:** deleting files or directories, `rm -rf`, `git clean`, `git checkout -- .`, `git reset --hard`, cleaning `node_modules`/`.next`, overwriting files you did not create in this task.
- **Dependencies:** installing, removing or upgrading packages; regenerating `package-lock.json`.
- **Database:** any migration, seed, `db push`, reset, raw SQL, or script that writes data (see §11).
- **Configuration:** changing CI workflows, `.env.example`, `next.config.mjs`, `middleware.ts` security behavior, or `package.json` scripts.

Approval is per action and per occasion; it never carries over to later actions.

---

## 1. Project overview

Studenv is a study / "second brain" web application:

- **Shelf** (`app/(app)/shelf`) — personal library of items (PDF, video, note, article, links) with collections and tags.
- **Dashboard** (`app/(dashboard)`) — overview, planner (tasks, drag reorder), focus sessions/reminders, achievements, profile, settings.
- **Study groups** (`app/(dashboard)/dashboard/groups`) — groups, join requests, messages with attachments, presence, and a live **study room** (WebRTC calls signalled over Socket.IO).
- **Spatial workspace** (`app/workspaces`, `components/workspace`) — infinite canvas with PDF pages/fragments, video anchors, images, text/sticky notes, freehand drawing, shapes, groups and smart connectors.
- **Auth** (`app/(auth)`) — credentials sign-up/sign-in, email verification, forgot/reset password, onboarding.
- **AI** (`app/api/ai/*`, `lib/services/ai*.service.ts`) — Google Generative AI for generation and content ingestion.
- Public pages: landing, about, FAQ, contact, privacy, terms, `robots.ts`, `sitemap.ts`.

Further design context: `docs/spatial-workspace-architecture.md` (verify against code before relying on it — §13).

---

## 2. Technology stack

| Area | Technology |
|---|---|
| Framework | Next.js **14.2.25** App Router, React 18, TypeScript 5 (strict) |
| Runtime | Node **22.22.3** (`.nvmrc`); engines `>=20.9 <24`. **Node 24 breaks Next dev asset serving — do not use it.** |
| Custom server | `server.ts` run with `tsx` (Next request handler + Socket.IO) |
| Database | PostgreSQL via **Prisma 5.22** (`@prisma/adapter-neon`, `@neondatabase/serverless`) |
| Auth | **next-auth 5.0.0-beta.25** (Credentials provider, JWT strategy), `argon2`, `jose` |
| Validation | `zod` (also defines workspace scene schemas) |
| Client state | `zustand` 5, `swr` 2, `idb` (IndexedDB) |
| Realtime | `socket.io` / `socket.io-client` 4, Server-Sent Events, WebRTC (TURN via `NEXT_PUBLIC_TURN_*`) |
| Canvas | Custom canvas + `perfect-freehand`, `react-rnd`, `react-zoom-pan-pinch`, `pdfjs-dist` 5, `pdf-lib`; `@tldraw/tldraw` is **legacy compatibility only** |
| Media | `react-player`, `youtube-transcript`, `yt-dlp-exec` |
| Storage | AWS S3 SDK (presigned + multipart) and local `public/uploads` |
| Security | `@upstash/ratelimit` + `@upstash/redis` (in-memory fallback), `isomorphic-dompurify` |
| Email | `nodemailer` (SMTP) |
| Styling | Tailwind CSS 3, PostCSS, CSS modules, some global CSS files, `framer-motion`, `lucide-react` |
| Tests | Node built-in `node:test` run through `tsx --test` |

Do not add, remove or upgrade dependencies without approval (§0.1).

---

## 3. Server, API and database architecture

### Custom server
- `server.ts` creates a Node HTTP server, delegates to Next's request handler, and attaches:
  - `attachStudyRoomSocketServer` → Socket.IO path `/api/study-room/socket/io`
  - `attachStudyGroupSocketServer` → Socket.IO path `/api/study-group/socket/io`
- Listens on `0.0.0.0:${PORT || 3000}`. `--prod` switches Next into production mode.
- **Consequence:** the app is *not* serverless-only. Socket.IO and the in-process event maps require a long-running Node process. Do not convert code to Edge runtime or assume `next start` / `next dev` is enough.

### Middleware
`middleware.ts` handles session-token checks (`next-auth/jwt`), rate limiting (`lib/security/rateLimit.ts`), and CORS/security headers (`lib/security/headers.ts`). Changes here affect every request — trace the full impact first.

### API layering (keep this layering)
```
app/api/**/route.ts        → thin HTTP layer: auth (requireAuth), input validation, response shaping
lib/services/*.service.ts  → business logic, authorization checks, audit logging
lib/repositories/*.ts      → data access (Prisma), extends base.repository.ts
lib/models/*.model.ts      → domain types / DTOs
lib/db/prisma.ts           → singleton PrismaClient (global cache in non-production)
```
- Route handlers must not contain business logic or raw Prisma queries when a service/repository exists.
- Use `requireAuth()` (`lib/auth/session.ts`), `validateId` / validators (`lib/security/validate.ts`), sanitizers (`lib/security/sanitize.ts`), and `getErrorResponse` (`lib/security/request.ts`). Do not leak internal error details to clients.
- Every data access must be scoped to the authenticated user or a verified group membership.

### Database
- Schema: `prisma/schema.prisma`. Key domains:
  - Identity: `User`, `Session`, `Account`, `VerificationToken`, `AuditLog`
  - Library: `Item`, `Collection`, `CollectionItem`, `Tag`, `ItemTag`
  - Media: `MediaAsset`, `AssetRevision`, `AssetPageManifest`
  - Workspace: `Workspace`, `WorkspaceSnapshot`, `WorkspaceOperation`
  - Jobs: `BackgroundJob`, `ExportJob` (processed by `scripts/worker.ts`, which checks the database every 5 seconds)
  - Learning: `AiAnalysis`, `Flashcard`, `QuizAttempt`, `FocusSession`, `Task`
  - Groups: `StudyGroup`, `StudyGroupMember`, `StudyGroupJoinRequest`, `StudyGroupMessage`, `StudyGroupMessageAttachment`
- Migrations: `prisma/migrations/*` (committed, immutable once applied). `DATABASE_URL` is the pooled URL; `DIRECT_DATABASE_URL` is used for migrations.
- See §11 for mandatory database safety rules.

---

## 4. Workspace and canvas architecture

### Structure
- **Scene model:** `types/workspace.ts` defines zod schemas and inferred types for every node:
  `TextNode`, `FreeTextNode`, `StickyNode`, `PdfPageNode`, `PdfFragmentNode`, `VideoAnchorNode`, `ImageNode`, `GroupNode`, `DrawingNode`, `ShapeNode`, `ConnectorNode` (+ `ConnectorAnchor`), unified as `WorkspaceNode` / `WorkspaceScene`.
  - Always go through `createWorkspaceScene`, `parseWorkspaceSceneJson`, `serializeWorkspaceScene`.
  - Schema changes must stay **backward compatible with existing persisted snapshots**: parse old data, normalize it, and never throw on legacy shapes.
  - New node types must be registered in the `WorkspaceNodeSchema` union.
- **Canvas:** `components/workspace/canvas.tsx` owns the pointer pipeline:
  - capture-phase pointer handlers (`onPointerDownCapture/Move/Up/Cancel`) and `setPointerCapture`
  - `touchAction: none` and native pinch-zoom prevention
  - pen pressure handling (mouse vs. pen vs. touch)
  - touch asset drop
- **UI components:**
  - Node renderers: `components/workspace/items/*`
  - Shapes UI and overlays: `components/workspace/shapes/*` (`SelectionOverlay`, `SnapGuidesOverlay`, `ShapeInteractionLayer`, `ShapeCreationOverlay`, …)
  - Connectors: `WorkspaceConnectorsLayer.tsx`, `WorkspaceConnectorHandles.tsx`
  - Toolbars: `DrawingToolbar.tsx`, `TextToolbar.tsx`, `ShapeStyleToolbar.tsx`
- **Pure engines (`lib/workspace/`)**: geometry and interaction logic lives here, free of React/DOM, so it is testable. Engines: `pointer-session`, `drawing-geometry`, `transform-engine`, `image-sizing`, `connector-geometry`, `selection-engine`, `snapping-engine`, `shape-engine`, `shape-paths`, `group-engine`, `layer-engine`, `keyboard-shortcuts`.
- **Persistence:**
  - Endpoints: `GET/PUT /api/workspace/[id]`, `/snapshot`, `/export`, `/search`.
  - Snapshots are versioned (`WorkspaceSnapshot.version`). The store tracks `version`, `isDirty`, `isSaving` and `lastSavedAt`, and re-saves if state changed during a request.
  - Never introduce a path that can silently drop newer edits or overwrite a newer snapshot.
- **Single source of truth:** item position, size and rotation live in the workspace store. `react-rnd`, overlays and selection outlines must reconcile *to* store state, never hold competing state.

### Mandatory pre-change inspection (canvas interactions)
Before changing any canvas interaction, inspect and be able to explain each of the following for the affected flow:

1. **Pointer-event lifecycle:**
   - `pointerdown → move → up/cancel` across capture and bubble phases
   - `setPointerCapture` / `lostpointercapture`
   - multiple simultaneous pointers, `pointercancel` from the OS or browser, and how `pointer-session` tracks state
2. **Coordinate transformations:**
   - client/screen → container → canvas/world coordinates and back
   - viewport pan offset and zoom scale
   - parent/group offsets, rotation transforms, `devicePixelRatio`, scroll and layout offsets
3. **Selection:** hit testing, single/multi/marquee selection, selection outlines and handles (and their behavior during drag), and the selection engine state.
4. **Object transforms:** move, resize (all handles, aspect lock, image sizing), rotate (rotated-frame anchors and handles), snapping, grouping, and connector anchor updates when attached objects transform.
5. **Rendering layers:** z-order (`layer-engine`); stacking of canvas, nodes, drawings, connectors, overlays and toolbars; which layer receives pointer events (`pointer-events`, `touch-action`); cursor ownership per tool.
6. **Persistence:** how the change reaches the store, dirty/save state, snapshot serialization, and reload/legacy-snapshot compatibility.

### Interaction preservation checklist (before and after every canvas change)
Reason through — and test where possible — each combination relevant to the change:

- **Input types:**
  - mouse: click, drag, wheel zoom, right-click/context menu, hover cursors
  - pen: pressure strokes, eraser, hover
  - touch: single-finger tools, two-finger pan/pinch, no native page zoom, toolbar taps that must not start drags, touch asset drop
  - keyboard shortcuts
- **Devices / viewports:** desktop, tablet, mobile (dynamic viewport units, responsive layout, small screens).
- **Rotation:** rotated objects (hit testing, handles, anchors, connectors, snapping on rotated frames) and device orientation changes.
- **Zoom levels:** minimum, default (100%), high zoom, and fractional zoom — hit areas, handle sizes, stroke widths and snapping thresholds must stay correct.
- **Pointer lifecycle edge cases:** cancel mid-gesture, capture lost, pointer leaving the canvas, switching tools mid-gesture.
- **Persistence:** reload preserves the scene; legacy snapshots still load.

State in the final report which of these were verified by automated tests, which by manual/browser checks, and which could not be verified.

---

## 5. State management and realtime architecture

### Client state
- **Zustand stores** (`hooks/`):
  - `use-workspace-store.ts` holds scene, viewport and save state **in memory only**. The legacy `workspace-storage` localStorage key is cleared on purpose, because inline media exceeds storage quotas.
  - Others: `use-viewer-store.ts`, `useAppStore.ts`, `useFocusStore.ts`, `usePlaybackStore.ts`.
- **SWR data hooks:** `useItems`, `useCollections`, `useSearch`, `useStudyGroups`, `useUser`, `useExport`. Shared fetcher: `lib/client/fetcher.ts`.
- **Local persistence:** `hooks/use-local-cache.ts`, `lib/storage/idb.service.ts` (IndexedDB), `lib/client/focus-persist.ts`.
- Do not persist workspace scenes to localStorage. Do not duplicate server state into Zustand when SWR already owns it.

### Realtime
- **Socket.IO** (`lib/realtime/*-socket-server.ts`):
  - Short-lived socket tokens come from `/api/study-groups/[id]/socket-token` and `/room/socket-token`, and are verified in `*-socket-auth.ts`.
  - Events include `room:connected`, `room:presence-snapshot`, `room:participants`, `room:update`, `call:participant-joined/left`, `webrtc:signal` and `room:ping/pong`.
- **SSE fallback:** `/api/study-groups/[id]/room/stream` subscribes via `lib/services/study-room-events.ts`.
- **Event buses** (`study-room-events.ts`, `study-group-events.ts`) are **in-process `Map`s** that only work within a single Node process. Do not assume horizontal scaling; flag it if a change depends on cross-instance delivery.
- **Client room state:** `components/study/room-state-store.ts`, `study-room-client.tsx`.
- Every socket handler must authorize the user against group membership. Never trust client-supplied user IDs or target socket IDs without checks.

---

## 6. Development commands and testing requirements

### Commands
| Command | Purpose |
|---|---|
| `npm ci` | Clean install (**requires approval** — §0.1) |
| `npm run dev` | `prisma generate`, then `tsx watch server.ts` (port 3000, Socket.IO enabled). Connects to whatever `DATABASE_URL` resolves to — check §11 first. |
| `npm run build` | `prisma generate` + `next build` |
| `npm start` | `tsx server.ts --prod` |
| `npm run preview` | Build + start production locally |
| `npm run lint` | `next lint` (`next/core-web-vitals`) |
| `npx tsc --noEmit` | Type check (CI-required) |
| `npm run test:workspace` | All workspace engine tests (pointer, drawing, image, image-resize, connectors) |
| `npm run test:workspace-<suite>` | Individual suite: `pointer`, `drawing`, `image`, `image-resize`, `connectors` |
| `npm run test:security` | `lib/security/request.test.ts` |
| `npm run db:check` | Database connectivity check (read-only, but confirm the target first — §11) |
| `npx tsx scripts/worker.ts` | Background job worker (**writes to the database** — §11) |
| `npm run prisma:generate` | Regenerate Prisma client (safe, no DB access) |
| `npm run prisma:migrate` / `prisma:deploy` / `prisma:seed` | **Gated — §11** |

Notes:
- `scripts/dev-entry.mjs` contains a Windows-only Node fallback path. On macOS/Linux, use Node 22 via nvm/fnm/volta.
- The dev server and worker are long-running: run them in the background, never as blocking foreground commands.
- Verify these commands against `package.json` before use (§13).

### Testing requirements
- **Test format:**
  - Tests live next to sources as `*.test.ts` and use `node:test` + `node:assert`.
  - New tests must be wired into a `test:*` script in `package.json` (with approval) so CI runs them.
- **Which suites to run:**
  - Changes to `lib/workspace/*`, `components/workspace/*` or `types/workspace.ts` → `npm run test:workspace`.
  - Changes to `lib/security/*` or `middleware.ts` → `npm run test:security`.
- **Regression tests:** bug fixes in pure logic need a regression test that fails before the fix and passes after.
- **Before reporting any change as done**, run at minimum:
  1. relevant `test:*` suites
  2. `npx tsc --noEmit`
  3. `npm run lint`
  4. `npm run build` (production build — mirrors CI `verify-pr.yml`)
- **Reporting:** give exact results. If something was not run or could not be verified (e.g. touch or pen behavior without a device), say so explicitly.

### CI
- `.github/workflows/verify-pr.yml`: on PRs to `main` → `npm ci`, `prisma generate`, `tsc --noEmit`, `npm run build` (Node 20).
- `.github/workflows/workspace-drawing-tests.yml`: on workspace-related paths → `npm run test:workspace` (Node 22).
- `.github/workflows/build-desktop.yml`: disabled.

---

## 7. Code quality and TypeScript conventions

- **Types:**
  - TypeScript `strict` is on. Do not add `any`, `@ts-ignore`, `@ts-expect-error`, non-null `!` or `as` casts to silence errors; fix the types. Existing `any` in legacy code is not a precedent.
  - Use the `@/*` import alias (root-relative).
- **Input validation:** validate all external input (request bodies, params, query, socket payloads, persisted JSON) with zod or `lib/security/validate.ts`.
- **Where code belongs:** keep route handlers thin, put logic in services, and put geometry/interaction math in `lib/workspace/*` as pure functions.
- **Client/server boundary:** client components need `"use client"`. Keep server-only modules (Prisma, argon2, nodemailer, `fs`) out of client bundles.
- **Style and formatting:**
  - Follow the existing naming and file conventions of the folder you are editing (match neighbors; do not mass-rename).
  - No new ESLint disables without justification in the PR.
  - Preserve the line endings and formatting of touched files; do not reformat whole files.
- **Cleanup:** do not leave debug `console.log`, temporary diagnostics or commented-out code in finished changes.

---

## 8. Root-cause-first debugging

For any bug:
1. **Reproduce or precisely characterize** the failure (inputs, device/pointer type, viewport, zoom level, rotation, steps).
2. **Trace the full flow** across every layer involved (component → store → API → service → repository → DB; or pointer event → pointer session → coordinate transform → engine → store → render → persistence).
3. **Identify the root cause** and explain it to the user — what is wrong, where, and why it produces the symptom — *before* writing the fix.
4. **Fix at the root**, not at the symptom. Avoid timeouts, extra guards, retries, `key` remounts or CSS overrides that mask the real issue.
5. **Prove it**: add or update a regression test where feasible; run the relevant suites and build.
6. If the root cause cannot be determined, say so, present the evidence and hypotheses, and ask before applying a mitigation.

---

## 9. Regression prevention and preserving existing behavior

- Before editing, list the existing behaviors the affected code supports and confirm each still works afterward.
- Do not change public API response shapes, socket event names/payloads, persisted scene formats, or URL routes without approval and a compatibility plan.
- Do not remove features, props, handlers or fallbacks that look unused without proving they are unused (search all callers, including legacy tldraw compatibility paths).
- No unrelated refactors, renames, dependency changes or style changes in a fix. Propose them separately.
- Keep diffs minimal and focused; one concern per change.
- For UI changes, check desktop and mobile layouts and mouse, pen and touch input (see §4).

---

## 10. Git branching, commits, PRs and merges

- **Every Git write operation requires explicit approval for that specific action** (§0.1). This includes commit, push, merge, rebase, cherry-pick, force-push, reset, branch create/delete, tag, stash drop, and opening or merging PRs.
- **Branches:**
  - `main` is the default branch and PR target. Never commit directly to `main`.
  - Branch naming follows existing patterns: `feat/…`, `fix/…`, `chore/…`, `style/…`, `seo/…`, `debug/…`.
  - Do not sync, rebase or delete existing local branches unasked; several have diverged from their remotes.
- **Commit messages:** Conventional Commits with scope, e.g. `fix(workspace): …`, `test(workspace): …`, `feat(auth): …`. Imperative, concise, one logical change per commit.
- **Before proposing a commit:**
  - Show `git status` and `git diff --stat`.
  - Confirm no secrets, logs, `.next/`, `node_modules/`, uploads or local scratch files are staged.
  - Stage files explicitly by path. Never use `git add -A` / `git add .` in this repo.
- **PR descriptions** must include: the root cause, the change, the tests/build run with results, the interaction checks performed (desktop/mobile/pen/touch/rotation/zoom), and known limitations.
- **Never use without explicit approval:** `--no-verify`, `--force`, `git reset --hard`, `git clean`, `git checkout -- .`, `git stash drop`.
- **Never merge PRs or enable auto-merge without explicit approval.**

---

## 11. Database safety rules

**Treat the configured database as potentially production.** `DATABASE_URL` / `DIRECT_DATABASE_URL` may point to a remote Neon Postgres host. Until the user has explicitly confirmed both the **environment** (dev/staging/production) and the **Neon branch** of the database in use, assume it holds real user data.

- **Identifying the target is allowed and expected.** Use safe programmatic inspection (§12) to determine which env file supplies the database URLs and the redacted host. This is read-only and needs no approval.
- **Migrations and seeds are never run without the user's explicit approval** — even after the environment is verified, and even against a dev database. Each run needs its own approval.
- **Before asking for approval for any database-affecting command, state:**
  1. the exact command
  2. the target host (redacted — never the full URL or credentials) and which env file it came from (`.env` vs `.env.local` override order)
  3. the confirmed environment and Neon branch, or that they are unverified
  4. the expected effect on schema and data, including anything destructive or irreversible
  5. the rollback or recovery path, if any
- **Gated commands** (each requires approval): `prisma migrate dev`, `prisma migrate deploy`, `prisma migrate reset`, `prisma migrate resolve`, `prisma db push`, `prisma db execute`, `prisma db seed`, `npm run prisma:migrate`, `npm run prisma:deploy`, `npm run prisma:seed`, `node prisma/seed.mjs`, `scripts/seed-test-user.mjs`, `scripts/worker.ts`, raw SQL, and any script or endpoint that writes to the database.
- **Known destructive behavior:**
  - `prisma/seed.mjs` upserts a demo user and **deletes all of that user's items and tags**.
  - `prisma migrate dev` can **reset the database** when it detects drift. Never run it against a shared, remote or unverified database.
  - `prisma db push` and `prisma migrate reset` are **forbidden** against any non-local or unverified database.
- Do not call the `app/api/dev-db-push`, `dev-db-generate` or `dev-db-debug` endpoints; they shell out to Prisma.
- **Development database:** prefer a local Postgres or a dedicated, confirmed Neon dev branch. Do not point `.env*` at a different database without approval.
- **Schema changes:**
  - Draft migrations with `prisma migrate dev --create-only`, only against a verified local/dev database and with approval.
  - Review the generated SQL and explain its data impact (drops, renames, NOT NULL additions, backfills, locks).
  - Never edit or delete an already-applied migration.
  - Renames must not be expressed as drop + add.
  - Keep `prisma/schema.prisma` and its migration in the same change.
- `prisma generate` is safe (no database access) and does not need approval.

---

## 12. Security requirements

- **Never expose secret values.** Never print, echo, log, diff, commit or send the values in `.env`, `.env.local`, `.env.*` (except `.env.example`), or the contents of `keyfile`, `keyfile.pub`, `ok`, `ok.pub`, `*.pem`, `*.key`, `id_*`, tokens, cookies or session data.
- **Safe programmatic inspection of environment files is allowed** when needed (e.g. to identify the database target or check which variables are configured):
  - Extract only key names, presence/absence, or a **redacted host** parsed from a URL (e.g. `ep-***.<region>.aws.neon.tech`, with endpoint IDs masked).
  - The command itself must strip usernames, passwords, tokens, query strings, database names and endpoint identifiers **before** anything is printed. Never `cat`, `grep` without redaction, or `source` an env file in a way that echoes values.
  - Never write extracted values to files, commit them, or pass them to external services.
- **Sensitive gitignored files** — `.env*`, private keys and key pairs, `public/uploads/**` (user content), `public/downloads/**`, and local scratch files in the repo root (previews, planning docs, one-off scripts, very large text dumps):
  - Do not read, print, delete, move or commit them unless the task requires it and the user approves. Do not read very large files in full.
- **Build artifacts and dependency metadata may be inspected read-only for diagnosis** without approval: `.next/` build output, `node_modules/**/package.json` and package sources, `node_modules/.prisma/client`, `package-lock.json`, `*.tsbuildinfo`, and dev/build log files. Deleting, cleaning or regenerating them still requires approval (§0.1). If a log or build artifact contains a secret, do not repeat it.
- **Environment variables:**
  - Keep `.env.example` as the documented list of required variables, with **no real values**. When adding a variable, add it there with an empty or placeholder value (with approval).
  - `NEXT_PUBLIC_*` variables are shipped to the browser: never put secrets in them.
- **Secrets in code:**
  - Never hardcode secrets or credentials in source, tests, fixtures or CI files.
  - `middleware.ts` has a dev-only fallback secret — never extend that pattern to production paths.
- **Git:** verify `.gitignore` coverage before staging; never force-add ignored files.
- Do not upload project data, env values or user data to external services, pastebins or unapproved URLs.
- **Server-side code must:**
  - authenticate (`requireAuth`) and authorize every resource access, scoped to user/group
  - validate and sanitize input, and sanitize any rendered HTML/markdown (DOMPurify)
  - keep rate limiting on auth and API routes
  - not expose stack traces or internal errors in responses
  - keep security headers and CORS restrictions intact
  - protect file uploads: validate type and size, never trust client paths, keep presigned URLs short-lived
- **Auth:**
  - Socket tokens must stay short-lived and server-verified; never trust client-supplied identities.
  - Passwords use `argon2`; do not change hashing parameters without approval.
  - Do not weaken auth flows (email verification, lockout, reset tokens) as a shortcut.
- **Exposed secrets:** report any secret found in tracked files to the user instead of silently moving or deleting it.

---

## 13. Documentation accuracy

- This file and `docs/` describe the architecture as understood when written; the code may have changed since.
- **Before relying on any architectural claim, file path, command, script name, event name or schema detail in this document, verify it against the current implementation** (`package.json`, `prisma/schema.prisma`, `server.ts`, the referenced source files, CI workflows).
- **If documentation and code disagree:**
  1. Treat the code as the source of truth for current behavior.
  2. Report the discrepancy to the user: what the doc says, what the code does, and where.
  3. Do not silently "fix" the code to match the doc, or the doc to match the code; propose the update and wait for approval.
- When a change alters architecture, commands, conventions or safety-relevant behavior described here, propose the matching CLAUDE.md update as part of the change.
