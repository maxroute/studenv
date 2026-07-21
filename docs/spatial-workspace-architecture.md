# Spatial Workspace Architecture for Second Brain

## 1. Purpose

This document defines the full architecture for a spatial note-making system with:

- infinite canvas
- floating PDF and video viewers
- page cloning from source media into a workspace
- PDF-style annotation overlays
- save-back into new source revisions
- video timestamp anchors
- local caching and cloud sync

This is written for your current `Second Brain` codebase, which already has:

- Next.js App Router
- Prisma + Postgres
- NextAuth
- Zustand
- item types for `pdf`, `video`, `note`, and `article`
- a playback overlay for videos
- MVSR-style backend organization in `lib/models`, `lib/services`, and `lib/repositories`

The key architectural conclusion is:

- do **not** force this into the current `Item` model
- create a new top-level `Workspace` domain
- keep source media immutable and versioned
- let workspace nodes reference source assets instead of embedding heavy binaries

## 2. Product Positioning

This is not a normal note editor.

It is a **spatial research workspace** that sits beside the main dashboard and library.

The current app remains responsible for:

- library browsing
- saved items
- collections
- tags
- account/profile/settings

The new workspace layer becomes responsible for:

- canvas composition
- visual thinking
- page fragments
- source-linked annotations
- anchorable media references
- versioned exports

## 3. Build Strategy

### Recommendation

Build this as a **separate workspace project** first, but shape it so it can be folded into the main app later.

The clean target structure is:

```text
second-brain-platform/
  apps/
    web/                    # current dashboard / library app
    workspace-studio/       # new spatial workspace app
    jobs/                   # background workers
  packages/
    domain-core/
    domain-workspace/
    storage/
    pdf-engine/
    video-engine/
    api-contracts/
    ui-workspace/
```

### Why a separate project first

- the workspace runtime is much heavier than the dashboard
- PDF rendering, canvas interaction, and asset caching need their own iteration loop
- you can keep the current app stable while building the new engine
- integration becomes a routing and domain-sharing problem instead of a rewrite

### How it later plugs into this app

- both apps use the same auth/session system
- both apps use the same Postgres database
- both apps use the same object storage bucket namespace
- the main app links into the workspace with shared `assetId` and `workspaceId`
- the workspace domain can later be mounted inside the current Next.js app under `/workspace`

## 4. Non-Negotiable Requirements

The system must support all of the following:

- drag a PDF page from a floating viewer onto the canvas
- drag a cropped area of a PDF page onto the canvas
- annotate cloned fragments without mutating the original file directly
- save annotations back as a new source revision
- watch video in a floating viewer while working on the canvas
- pin a timestamped anchor or frame snapshot into the workspace
- move nodes freely on an infinite 2D plane
- zoom, pan, group, duplicate, layer, and search nodes
- keep source references intact even if the canvas changes
- cache large media locally for fast re-open
- sync workspace state safely to cloud storage

## 5. Core Architectural Principle

The workspace does not own source media.

It owns **references** to source media plus overlay state.

That means:

- PDFs stay as canonical assets in storage
- videos stay as canonical assets or external references
- workspace nodes point to asset revisions and page regions
- annotations are stored as overlay vectors
- exporting or saving back creates a **new revision**

This keeps the system:

- fast
- versionable
- auditable
- reversible
- storage-efficient

## 6. Recommended Technology Choices

### Frontend Runtime

| Concern | Choice | Reason |
|---|---|---|
| App shell | Next.js | Matches current app and future integration path |
| Spatial canvas | Custom canvas engine | Matches the current product direction, keeps the scene model fully controlled, and avoids coupling the workspace format to a third-party editor runtime |
| Local UI state | Zustand | Already used in current app |
| Immutable updates | Immer | Keeps command-style updates clear |
| Validation | Zod | Already used in current app |
| PDF viewing | PDF.js | Standard and flexible for page rendering and text layers |
| Ink drawing | Perfect Freehand | Smooth annotation strokes |
| Video player | React Player plus provider adapters | Flexible for mixed sources and controlled events |
| Local file cache | IndexedDB | Browser-side asset and thumbnail caching |

### Backend Runtime

| Concern | Choice | Reason |
|---|---|---|
| Metadata DB | Postgres via Prisma | Matches current stack |
| Binary storage | S3-compatible object storage | Keeps large files out of Postgres |
| Background jobs | Node worker process | Needed for ingestion, thumbnails, exports |
| Queue | Postgres-backed queue or Redis queue | Required for async media jobs |
| Search | Postgres full-text plus derived page text | Good first implementation |

## 7. High-Level System Diagram

```text
User
  -> Workspace Studio UI
      -> Canvas Engine
      -> Floating Viewer Layer
      -> Workspace Store
      -> IndexedDB Cache
      -> Workspace API
            -> Workspace Service
            -> Asset Service
            -> Export Service
            -> Search Service
            -> Prisma/Postgres
            -> Object Storage
            -> Background Job Worker
                  -> PDF ingest
                  -> thumbnail generation
                  -> text layer extraction
                  -> frame capture
                  -> export / save-back
```

## 8. Domain Model

The domain must be split into these bounded contexts:

- `Library`
- `Assets`
- `Workspace`
- `Annotations`
- `Playback`
- `Exports`
- `Search`

### 8.1 Library Domain

This is your existing `Item` system.

It remains the user-facing saved media catalog.

It should not be overloaded with:

- node positions
- PDF fragment geometry
- workspace layout state
- annotation vectors

### 8.2 Asset Domain

This is the canonical source-media layer used by the workspace.

An asset can originate from:

- an uploaded file
- an existing `Item` URL
- a generated derivative
- a snapshot frame
- a page export

### 8.3 Workspace Domain

This is the canvas document itself.

A workspace contains:

- metadata
- version history
- a scene graph of nodes
- layout state
- camera state
- optional groups and relations

### 8.4 Annotation Domain

This holds:

- ink strokes
- highlights
- boxes
- callouts
- free text overlays
- redactions if later required

### 8.5 Playback Domain

This holds:

- floating video player session state
- anchor creation events
- poster frame generation requests
- current timestamp sync

### 8.6 Export Domain

This is responsible for:

- stamping annotations onto source pages
- producing new asset revisions
- generating merged output files
- maintaining export job history

## 9. Canonical Data Entities

These are the minimum production-grade entities.

### 9.1 MediaAsset

Represents the canonical source or derivative media object.

```ts
type MediaAssetKind = "pdf" | "video" | "image" | "audio" | "webpage" | "snapshot";
type MediaAssetOrigin = "upload" | "external_url" | "second_brain_item" | "generated";

interface MediaAsset {
  id: string;
  ownerId: string;
  itemId?: string | null;
  kind: MediaAssetKind;
  origin: MediaAssetOrigin;
  title: string;
  mimeType?: string | null;
  sourceUrl?: string | null;
  sourceHost?: string | null;
  currentRevisionId: string;
  status: "processing" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
}
```

### 9.2 AssetRevision

Every meaningful source update produces a new immutable revision.

```ts
interface AssetRevision {
  id: string;
  assetId: string;
  parentRevisionId?: string | null;
  revisionNumber: number;
  storageKey: string;
  manifestKey?: string | null;
  checksum?: string | null;
  sizeBytes?: number | null;
  pageCount?: number | null;
  durationMs?: number | null;
  createdBy: string;
  createdAt: string;
}
```

### 9.3 AssetPageManifest

Stores per-page derived metadata for PDFs.

```ts
interface AssetPageManifest {
  id: string;
  assetRevisionId: string;
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  thumbnailKey?: string | null;
  previewKey?: string | null;
  textLayerKey?: string | null;
  searchText?: string | null;
}
```

### 9.4 Workspace

The top-level canvas document.

```ts
interface Workspace {
  id: string;
  ownerId: string;
  title: string;
  description?: string | null;
  coverAssetId?: string | null;
  baseCollectionId?: string | null;
  lastSnapshotId?: string | null;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
}
```

### 9.5 WorkspaceSnapshot

Stores an immutable versioned scene snapshot.

```ts
interface WorkspaceSnapshot {
  id: string;
  workspaceId: string;
  version: number;
  sceneJson: string;
  cameraJson?: string | null;
  createdBy: string;
  createdAt: string;
}
```

### 9.6 WorkspaceOperation

Append-only command/event log for replay, sync, and recovery.

```ts
interface WorkspaceOperation {
  id: string;
  workspaceId: string;
  version: number;
  actorId: string;
  clientId: string;
  opType: string;
  payloadJson: string;
  createdAt: string;
}
```

### 9.7 ExportJob

Tracks save-back and merged-file operations.

```ts
interface ExportJob {
  id: string;
  workspaceId: string;
  sourceAssetId: string;
  sourceRevisionId: string;
  targetRevisionId?: string | null;
  jobType: "pdf_save_back" | "pdf_export" | "snapshot_export";
  status: "queued" | "processing" | "done" | "failed";
  inputJson: string;
  outputJson?: string | null;
  errorMessage?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

## 10. Workspace Scene Model

The scene should be stored as a versioned JSON graph.

The most important rule is:

- node payloads must be strongly typed
- all source references must use `assetId` plus `revisionId`
- geometry and annotations must be stored separately from source media

### 10.1 Node Types

Minimum required node types:

- `text`
- `sticky`
- `pdf_fragment`
- `pdf_page`
- `video_anchor`
- `video_snapshot`
- `image`
- `group`
- `connector`

### 10.2 Base Node

```ts
interface BaseNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked?: boolean;
  hidden?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 10.3 PDF Fragment Node

```ts
interface PdfFragmentNode extends BaseNode {
  type: "pdf_fragment";
  assetId: string;
  revisionId: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  renderMode: "canvas" | "svg" | "thumbnail";
  annotations: AnnotationLayer[];
}
```

### 10.4 Video Anchor Node

```ts
interface VideoAnchorNode extends BaseNode {
  type: "video_anchor";
  assetId: string;
  revisionId: string;
  startTimeMs: number;
  endTimeMs?: number | null;
  posterFrameKey?: string | null;
  label?: string | null;
  notes?: string | null;
}
```

### 10.5 Annotation Layer

```ts
type AnnotationLayer =
  | InkStrokeAnnotation
  | HighlightAnnotation
  | RectangleAnnotation
  | TextAnnotation;

interface InkStrokeAnnotation {
  id: string;
  kind: "ink";
  color: string;
  width: number;
  points: Array<{ x: number; y: number; pressure?: number }>;
}

interface HighlightAnnotation {
  id: string;
  kind: "highlight";
  color: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
}

interface RectangleAnnotation {
  id: string;
  kind: "rect";
  color: string;
  strokeWidth: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextAnnotation {
  id: string;
  kind: "text";
  color: string;
  fontSize: number;
  x: number;
  y: number;
  text: string;
}
```

## 11. Rendering Architecture

The UI needs four major render layers:

### 11.1 Canvas Layer

Responsible for:

- pan
- zoom
- selection
- transforms
- groups
- hit testing
- keyboard shortcuts

This should be owned by a custom canvas engine with:

- a typed scene schema
- a renderer registry for node types
- custom interaction logic for selection and transforms

The first node renderers should cover:

- PDF fragments
- video anchors
- snapshot cards

### 11.2 Floating Viewer Layer

This must sit outside the canvas as a portal so it can remain visible while editing.

It includes:

- PDF viewer window
- video viewer window
- inspector panels
- clone/insert actions

This layer must support:

- docking
- minimizing
- focus
- resizable windows
- source switching

### 11.3 Asset Surface Layer

This renders the actual page or video preview content.

For PDFs:

- use PDF.js page surfaces
- render current visible page at suitable zoom
- expose page dimensions and text layer geometry

For videos:

- use a controlled player wrapper
- emit timestamp events
- capture poster frames

### 11.4 Annotation Overlay Layer

This is always separate from the source surface.

It renders:

- vector strokes
- highlight geometry
- callouts
- shapes

It must use source-relative coordinates so overlays remain aligned while zooming.

## 12. PDF Ingestion Pipeline

PDF support is not just a viewer problem.

It needs an ingestion pipeline.

### 12.1 When a PDF is added

1. Create `MediaAsset`
2. Create first `AssetRevision`
3. Upload binary to object storage
4. Queue ingest job
5. Worker extracts:
   - page count
   - page dimensions
   - thumbnails
   - preview images if needed
   - text layer JSON
   - searchable text
6. Mark asset as `ready`

### 12.2 Required derived outputs

- thumbnail for each page
- preview render for fast gallery browsing
- text layer geometry for accurate highlights
- optional OCR for scanned PDFs

### 12.3 Page cloning flow

1. User opens floating PDF viewer
2. Viewer shows page rail
3. User drags page or crop region to canvas
4. Frontend creates node payload referencing:
   - `assetId`
   - `revisionId`
   - `pageNumber`
   - crop bounds
5. Node is inserted into scene

## 13. PDF Annotation and Save-Back

### 13.1 Annotation design

Never edit the original PDF in place.

Always:

- store overlay annotations in workspace state
- export annotations into a new asset revision

### 13.2 Save-back flow

1. User clicks `Save to source`
2. Frontend sends export request with:
   - `workspaceId`
   - `sourceAssetId`
   - `sourceRevisionId`
   - target pages
   - annotation layers
3. Backend queues `ExportJob`
4. Worker loads source PDF
5. Worker converts overlay vectors into PDF drawing instructions
6. Worker stamps overlays onto target pages
7. Worker writes a new PDF binary
8. Worker creates new `AssetRevision`
9. `MediaAsset.currentRevisionId` is updated
10. Workspace can choose:
   - stay pinned to old revision
   - update linked nodes to new revision

### 13.3 Versioning policy

Use immutable revisions.

Do not overwrite the original file.

That gives:

- auditability
- rollback
- safer export retries
- multi-workspace consistency

## 14. Video Anchor Architecture

### 14.1 Canonical behavior

The floating video viewer remains live while the user works on the canvas.

When the user presses `Pin`:

- capture current timestamp
- optionally capture a frame image
- create a `video_anchor` or `video_snapshot` node

### 14.2 Anchor payload

An anchor should store:

- `assetId`
- `revisionId`
- `startTimeMs`
- optional `endTimeMs`
- optional poster frame storage key
- optional note text

### 14.3 Click behavior

When a user clicks a video anchor node:

- the viewer opens if not already visible
- the linked media loads
- the player seeks to `startTimeMs`
- playback optionally starts automatically

### 14.4 Frame capture

If source supports frame extraction:

- capture current frame on client or worker
- store as derived snapshot asset
- associate snapshot with anchor node

## 15. State Management Strategy

Do not put everything in one Zustand store.

Split state into clear slices.

### 15.1 UI Store

Holds:

- open panels
- active viewer
- selected tool
- zoom UI
- modal state

### 15.2 Scene Store

Holds:

- current scene graph
- selection
- history stack
- unsynced operations

### 15.3 Viewer Store

Holds:

- current PDF asset
- active page
- current crop mode
- current video asset
- current timestamp

### 15.4 Sync Store

Holds:

- current workspace version
- pending patches
- save state
- offline state
- retry queue

### 15.5 Cache Store

Holds:

- local page thumbnails
- page render cache keys
- frame previews

## 16. Persistence Strategy

### 16.1 What lives in Postgres

- users
- library items
- workspaces
- asset metadata
- asset revisions
- page manifests
- operation logs
- export jobs

### 16.2 What lives in object storage

- original binaries
- derived thumbnails
- page previews
- OCR/text layer files
- poster frames
- exported PDFs

### 16.3 What lives in IndexedDB

- recently opened page thumbnails
- page preview cache
- unsynced workspace operations
- temporary upload manifests
- viewer session cache

### 16.4 What must never live in Postgres

- full PDF binaries
- raw video binaries at scale
- large raster page caches
- oversized scene screenshots

## 17. Sync Model

The workspace should be resilient even before real-time collaboration exists.

### 17.1 Recommended sync pattern

- optimistic local command application
- append operation to local queue
- send operation batch to server
- server validates and increments workspace version
- client receives acknowledged version
- periodic full snapshot creation for recovery

### 17.2 Required safety rules

- every operation carries `workspaceId`, `clientId`, and `baseVersion`
- server rejects invalid base versions
- client fetches latest snapshot and rebases if needed
- snapshots are generated every N operations or every T seconds

### 17.3 Why not only store full scene JSON

Full snapshot only is too fragile for:

- undo history recovery
- conflict resolution
- audit trails
- crash recovery

Use:

- operations for live sync
- snapshots for restore points

## 18. API Surface

This is the minimum clean API surface.

### 18.1 Asset APIs

- `POST /api/assets`
- `GET /api/assets/:id`
- `GET /api/assets/:id/revisions`
- `GET /api/assets/:id/revisions/:revisionId/pages`
- `POST /api/assets/:id/revisions/:revisionId/frame-capture`

### 18.2 Workspace APIs

- `POST /api/workspaces`
- `GET /api/workspaces/:id`
- `GET /api/workspaces/:id/snapshot`
- `POST /api/workspaces/:id/operations`
- `POST /api/workspaces/:id/snapshots`
- `GET /api/workspaces/:id/search`

### 18.3 Export APIs

- `POST /api/exports/pdf-save-back`
- `POST /api/exports/pdf-bundle`
- `GET /api/exports/:id`

### 18.4 Integration APIs

- `POST /api/library/items/:id/attach-asset`
- `POST /api/library/items/:id/open-workspace`
- `GET /api/users/me/workspaces`

## 19. Backend Module Layout

To match your current MVSR style, the new backend should look like this:

```text
lib/
  models/
    asset.model.ts
    workspace.model.ts
    export.model.ts
  services/
    asset.service.ts
    workspace.service.ts
    annotation.service.ts
    export.service.ts
    ingest.service.ts
  repositories/
    asset.repository.ts
    workspace.repository.ts
    snapshot.repository.ts
    export.repository.ts
  workers/
    pdf-ingest.worker.ts
    export.worker.ts
    frame-capture.worker.ts
  storage/
    object-storage.ts
    indexeddb-cache.ts
  workspace/
    node-types.ts
    scene-schema.ts
    commands.ts
```

## 20. Frontend Module Layout

```text
components/workspace/
  canvas-shell.tsx
  floating-viewer-layer.tsx
  workspace-toolbar.tsx
  workspace-sidebar.tsx
  node-renderers/
    pdf-fragment-node.tsx
    video-anchor-node.tsx
    sticky-node.tsx
  pdf/
    pdf-viewer-window.tsx
    page-rail.tsx
    crop-tool.tsx
    annotation-overlay.tsx
  video/
    video-viewer-window.tsx
    anchor-button.tsx
    frame-capture-button.tsx
hooks/
  useWorkspaceStore.ts
  useWorkspaceSync.ts
  useWorkspaceAssets.ts
  useFloatingViewer.ts
  useAnnotationTools.ts
```

## 21. Search and Retrieval

The workspace becomes much more valuable if it is searchable.

Search should index:

- workspace title
- node text
- PDF page extracted text
- anchor labels
- annotation text notes

Search results should be able to:

- open the correct workspace
- move camera to the matching node
- highlight the result in context

## 22. Security and Validation

This feature touches files, exports, and rich client state, so the backend must remain strict.

### 22.1 Required protections

- validate every operation payload with Zod
- ownership checks on every workspace and asset fetch
- signed URLs for object storage access
- server-side file type validation
- page count and file size caps
- job rate limiting
- export quotas for free plans if needed later

### 22.2 Safe file handling

- scan uploaded files if you later allow arbitrary uploads
- sanitize generated SVG used for export
- reject oversized PDFs beyond configured thresholds
- isolate worker temp files

## 23. Performance Targets

Set these targets early.

- workspace open under 2 seconds for cached scenes
- page clone insert under 150 ms after drag drop
- viewer page switch under 250 ms for cached pages
- save-back export visible as queued job immediately
- canvas interaction at 60 fps on common laptops

### 23.1 Performance techniques

- virtualize page rail and asset lists
- render only visible nodes at high fidelity
- fall back to lower-resolution previews while panning
- cache text layer and thumbnails
- chunk operation sync batches

## 24. UX Rules

These interaction rules matter as much as the backend.

### 24.1 PDF clone behavior

- dragging a page thumbnail creates a full-page node
- dragging with crop mode creates a fragment node
- double-clicking fragment opens source page in viewer

### 24.2 Video anchor behavior

- `Pin` creates anchor at current timestamp
- optional modifier key captures frame too
- click node to jump player to linked time

### 24.3 Save-back behavior

- user chooses target pages or linked fragments
- export produces a new revision
- UI clearly indicates which nodes reference which revision

## 25. Integration Plan for the Current App

This is the most important part for future adoption.

### 25.1 Short-term integration

Keep the current app as the primary shell.

Add:

- `Workspace` entry in sidebar or dashboard header
- `Open in Workspace` action on PDF and video items
- `Create Workspace from Collection` action

### 25.2 Shared identity

Use the same:

- `User` table
- NextAuth configuration
- session secret
- cookie domain if hosted together

### 25.3 Shared media mapping

Existing `Item` records should be promotable into canonical assets.

Recommended bridge table behavior:

- each current `Item` may map to zero or one `MediaAsset`
- `MediaAsset.itemId` links back to the current library object
- workspaces always use `MediaAsset`, not raw `Item`

### 25.4 Dashboard coexistence

Do not replace the dashboard.

Instead:

- dashboard remains the collection and review surface
- workspace becomes the deep-work surface

### 25.5 Migration path

1. Keep current `Item` tables unchanged
2. Add new workspace and asset tables
3. Add `itemId` foreign key on `MediaAsset`
4. Let workspace features read from current library
5. Later, if desired, promote `MediaAsset` to the canonical underlying source model

## 26. Suggested Prisma Expansion

This is the schema direction, not a final migration file.

```prisma
model MediaAsset {
  id                String         @id @default(cuid())
  ownerId           String
  itemId            String?        @unique
  kind              String
  origin            String
  title             String
  mimeType          String?
  sourceUrl         String?
  sourceHost        String?
  currentRevisionId String?
  status            String         @default("processing")
  owner             User           @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  item              Item?          @relation(fields: [itemId], references: [id], onDelete: SetNull)
  revisions         AssetRevision[]
  workspaces        Workspace[]
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
}

model AssetRevision {
  id               String       @id @default(cuid())
  assetId          String
  parentRevisionId String?
  revisionNumber   Int
  storageKey       String
  manifestKey      String?
  checksum         String?
  sizeBytes        BigInt?
  pageCount        Int?
  durationMs       Int?
  createdBy        String
  asset            MediaAsset   @relation(fields: [assetId], references: [id], onDelete: Cascade)
  parentRevision   AssetRevision? @relation("AssetRevisionLineage", fields: [parentRevisionId], references: [id], onDelete: SetNull)
  childRevisions   AssetRevision[] @relation("AssetRevisionLineage")
  pages            AssetPageManifest[]
  createdAt        DateTime     @default(now())

  @@unique([assetId, revisionNumber])
}

model AssetPageManifest {
  id              String        @id @default(cuid())
  assetRevisionId String
  pageNumber      Int
  width           Int
  height          Int
  rotation        Int           @default(0)
  thumbnailKey    String?
  previewKey      String?
  textLayerKey    String?
  searchText      String?       @db.Text
  assetRevision   AssetRevision @relation(fields: [assetRevisionId], references: [id], onDelete: Cascade)

  @@unique([assetRevisionId, pageNumber])
}

model Workspace {
  id               String              @id @default(cuid())
  ownerId          String
  title            String
  description      String?             @db.Text
  coverAssetId     String?
  baseCollectionId String?
  lastSnapshotId   String?
  latestVersion    Int                 @default(0)
  owner            User                @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  coverAsset       MediaAsset?         @relation(fields: [coverAssetId], references: [id], onDelete: SetNull)
  snapshots        WorkspaceSnapshot[]
  operations       WorkspaceOperation[]
  exportJobs       ExportJob[]
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  @@index([ownerId, updatedAt(sort: Desc)])
}

model WorkspaceSnapshot {
  id         String    @id @default(cuid())
  workspaceId String
  version    Int
  sceneJson  String    @db.Text
  cameraJson String?   @db.Text
  createdBy  String
  workspace  Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdAt  DateTime  @default(now())

  @@unique([workspaceId, version])
}

model WorkspaceOperation {
  id         String    @id @default(cuid())
  workspaceId String
  version    Int
  actorId    String
  clientId   String
  opType     String
  payloadJson String   @db.Text
  workspace  Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdAt  DateTime  @default(now())

  @@unique([workspaceId, version])
  @@index([workspaceId, createdAt])
}

model ExportJob {
  id               String    @id @default(cuid())
  workspaceId      String
  sourceAssetId    String
  sourceRevisionId String
  targetRevisionId String?
  jobType          String
  status           String
  inputJson        String    @db.Text
  outputJson       String?   @db.Text
  errorMessage     String?   @db.Text
  createdBy        String
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([workspaceId, createdAt(sort: Desc)])
}
```

## 27. Background Jobs

The following must run outside the request cycle:

- PDF ingest
- thumbnail generation
- OCR
- text extraction
- frame capture
- PDF export and save-back

The current app does not yet have a worker boundary, so this must be introduced deliberately.

Recommended first worker commands:

- `jobs:pdf-ingest`
- `jobs:export`
- `jobs:frame-capture`

## 28. What Not To Do

Avoid these mistakes:

- do not store full page images inside scene JSON
- do not mutate source PDFs in place
- do not attach all workspace state to the existing `Item` row
- do not let the dashboard Zustand store own canvas document state
- do not keep only local browser state without server snapshots
- do not build export inside the browser for large PDFs

## 29. Execution Roadmap

### Phase 0. Foundation

- create new workspace project
- share auth with current app
- add object storage
- add worker process
- add new Prisma models

### Phase 1. Asset Layer

- build `MediaAsset` and `AssetRevision`
- ingest PDFs
- create page manifests and thumbnails
- map existing `Item` rows to assets

### Phase 2. Canvas Runtime

- define the typed custom scene schema
- implement the custom canvas runtime
- add custom text and sticky nodes
- add workspace save/load
- implement snapshots and operations

### Phase 3. Floating PDF Viewer

- build PDF window
- page rail
- clone full page to canvas
- clone crop fragment to canvas

### Phase 4. Annotation Layer

- ink
- highlight
- callouts
- annotation persistence

### Phase 5. Save-Back Pipeline

- export job queue
- stamp annotations onto PDF
- create new revisions
- revision switch UI

### Phase 6. Video Viewer and Anchors

- controlled floating player
- timestamp pinning
- frame snapshot node
- anchor-to-player navigation

### Phase 7. Search and Integration

- workspace search
- dashboard launch points
- collection-to-workspace bridge
- open item in workspace actions

## 30. Final Recommendation

The correct way to build this is:

- as a dedicated workspace engine
- on top of your current auth and data foundations
- with a new `Workspace` plus `MediaAsset` domain
- with immutable source revisions
- with operation-log plus snapshot persistence
- with object storage and background jobs from day one

If you try to bolt this directly onto the current `Item` detail panel and dashboard state, it will become brittle fast.

If you build it as a clean sidecar project with shared identity and shared media references, it can later become a first-class surface inside `Second Brain` without redoing the fundamentals.
