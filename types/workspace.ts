import { z } from "zod";
import { withoutOrphanConnectors } from "@/lib/workspace/connector-lifecycle";

export const WORKSPACE_SCENE_FORMAT = "second-brain-workspace";
export const WORKSPACE_SCENE_VERSION = 1;

export const DEFAULT_WORKSPACE_VIEWPORT = {
  x: 0,
  y: 0,
  zoom: 1,
} as const;

export const DEFAULT_PDF_CROP = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
} as const;

export const WorkspaceViewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().positive(),
});

const WorkspaceNodeBaseSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
  rotation: z.number().finite().default(0),
  zIndex: z.number().int(),
});

const PdfCropSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

/**
 * Lock and group membership, shared by every element type. Optional so
 * snapshots saved before they existed parse unchanged (shapes keep their
 * historical `locked` default of false).
 */
const ElementMetaProps = {
  locked: z.boolean().optional(),
  groupId: z.string().min(1).optional(),
};

export const TextNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("text"),
  props: z.object({
    ...ElementMetaProps,
    text: z.string().default(""),
    color: z.string().optional(),
    fontSize: z.number().finite().positive().optional(),
  }),
});

export const FreeTextNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("free-text"),
  props: z.object({
    ...ElementMetaProps,
    text: z.string().default(""),
    color: z.string().default("#1e1e1e"),
    fontSize: z.number().finite().positive().default(28),
  }),
});

export const StickyNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("sticky"),
  props: z.object({
    ...ElementMetaProps,
    text: z.string().default(""),
    color: z.string().optional(),
  }),
});

export const PdfPageNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("pdf-page"),
  props: z.object({
    ...ElementMetaProps,
    assetId: z.string().min(1),
    revisionId: z.string().min(1).optional(),
    pageNumber: z.number().int().positive(),
  }),
});

export const PdfFragmentNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("pdf-fragment"),
  props: z.object({
    ...ElementMetaProps,
    assetId: z.string().min(1),
    revisionId: z.string().min(1).optional(),
    pageNumber: z.number().int().positive(),
    crop: PdfCropSchema.default(DEFAULT_PDF_CROP),
    previewSrc: z.string().optional(),
  }),
});

export const VideoAnchorNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("video-anchor"),
  props: z.object({
    ...ElementMetaProps,
    assetId: z.string().min(1),
    revisionId: z.string().min(1).optional(),
    startTimeMs: z.number().int().nonnegative(),
    endTimeMs: z.number().int().nonnegative().optional(),
    label: z.string().optional(),
    notes: z.string().optional(),
    color: z.string().default("#F8E7A1"),
  }),
});

export const ImageNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("image"),
  props: z.object({
    ...ElementMetaProps,
    assetId: z.string().min(1).optional(),
    src: z.string().min(1).optional(),
    alt: z.string().optional(),
  }),
});

export const GroupNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("group"),
  props: z.object({
    ...ElementMetaProps,
    label: z.string().optional(),
  }),
});

const DrawingPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  pressure: z.number().finite().min(0).max(1).optional(),
});

export const DrawingNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("drawing"),
  props: z.object({
    ...ElementMetaProps,
    d: z.string(),
    color: z.string().default("#4f46e5"),
    strokeWidth: z.number().default(3),
    points: z.array(DrawingPointSchema).optional(),
    outline: z.boolean().default(false),
  }),
});

export const ShapeNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("shape"),
  props: z.object({
    kind: z.enum([
      "rectangle",
      "rounded-rectangle",
      "circle",
      "ellipse",
      "triangle",
      "diamond",
      "hexagon",
      "pentagon",
      "star",
      "arrow",
      "line",
    ]),
    fill: z.object({
      type: z.enum(["solid", "transparent"]),
      color: z.string(),
    }),
    stroke: z.object({
      width: z.number().finite().positive(),
      color: z.string(),
      style: z.enum(["solid", "dashed", "dotted"]),
    }),
    cornerRadius: z.number().finite().nonnegative().default(0),
    opacity: z.number().min(0).max(100).default(100),
    shadow: z.boolean().default(false),
    locked: z.boolean().default(false),
    groupId: z.string().optional(),
    startPoint: z.object({ x: z.number(), y: z.number() }).optional(),
    endPoint: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
});

export const ConnectorAnchorSchema = z.enum(["top", "right", "bottom", "left"]);

/** Relative [0..1] position inside an element's unrotated bounds for each named side anchor. */
export const CONNECTOR_ANCHOR_POSITIONS: Record<z.infer<typeof ConnectorAnchorSchema>, [number, number]> = {
  top: [0.5, 0],
  right: [1, 0.5],
  bottom: [0.5, 1],
  left: [0, 0.5],
};

const ConnectorVecSchema = z.tuple([z.number().finite(), z.number().finite()]);

/**
 * One connector end. With `id`, `position` is relative [0..1] within that
 * element's unrotated bounds (rotation is applied when resolving); without
 * `position` the end auto-picks the element's nearest anchor. Without `id`,
 * `position` is an absolute world point (a free end).
 */
export const ConnectorEndSchema = z
  .object({
    id: z.string().min(1).optional(),
    position: ConnectorVecSchema.optional(),
  })
  .refine((end) => Boolean(end.id || end.position), {
    message: "A connector end needs an element id or a position",
  });

export const ConnectorModeSchema = z.enum(["straight", "elbow", "curve"]);
export const ConnectorStrokeStyleSchema = z.enum(["solid", "dash"]);
export const ConnectorEndpointStyleSchema = z.enum(["none", "arrow", "triangle", "circle", "diamond"]);

export const DEFAULT_CONNECTOR_MODE: z.infer<typeof ConnectorModeSchema> = "curve";
export const DEFAULT_CONNECTOR_COLOR = "#929292";
export const DEFAULT_CONNECTOR_STROKE_WIDTH = 2;

export const ConnectorLabelSchema = z.object({
  text: z.string(),
  /** Fraction 0..1 along the connector path where the label is centred. */
  offset: z.number().min(0).max(1).default(0.5),
});

export const ConnectorNodeSchema = WorkspaceNodeBaseSchema.extend({
  type: z.literal("connector"),
  props: z.object({
    ...ElementMetaProps,
    source: ConnectorEndSchema,
    target: ConnectorEndSchema,
    mode: ConnectorModeSchema.default(DEFAULT_CONNECTOR_MODE),
    color: z.string().default(DEFAULT_CONNECTOR_COLOR),
    strokeWidth: z.number().finite().positive().default(DEFAULT_CONNECTOR_STROKE_WIDTH),
    strokeStyle: ConnectorStrokeStyleSchema.default("solid"),
    frontEndpointStyle: ConnectorEndpointStyleSchema.default("none"),
    rearEndpointStyle: ConnectorEndpointStyleSchema.default("arrow"),
    label: ConnectorLabelSchema.optional(),
  }),
});

export const WorkspaceNodeSchema = z.discriminatedUnion("type", [
  TextNodeSchema,
  FreeTextNodeSchema,
  StickyNodeSchema,
  PdfPageNodeSchema,
  PdfFragmentNodeSchema,
  VideoAnchorNodeSchema,
  ImageNodeSchema,
  GroupNodeSchema,
  DrawingNodeSchema,
  ShapeNodeSchema,
  ConnectorNodeSchema,
]);

export const WorkspaceSceneSchema = z.object({
  format: z.literal(WORKSPACE_SCENE_FORMAT),
  version: z.literal(WORKSPACE_SCENE_VERSION),
  items: z.array(WorkspaceNodeSchema),
  workspaceAssetIds: z.array(z.string().min(1)).default([]),
  viewport: WorkspaceViewportSchema,
});

export type WorkspaceViewport = z.infer<typeof WorkspaceViewportSchema>;
export type PdfCrop = z.infer<typeof PdfCropSchema>;
export type TextNode = z.infer<typeof TextNodeSchema>;
export type FreeTextNode = z.infer<typeof FreeTextNodeSchema>;
export type StickyNode = z.infer<typeof StickyNodeSchema>;
export type PdfPageNode = z.infer<typeof PdfPageNodeSchema>;
export type PdfFragmentNode = z.infer<typeof PdfFragmentNodeSchema>;
export type VideoAnchorNode = z.infer<typeof VideoAnchorNodeSchema>;
export type ImageNode = z.infer<typeof ImageNodeSchema>;
export type GroupNode = z.infer<typeof GroupNodeSchema>;
export type DrawingNode = z.infer<typeof DrawingNodeSchema>;
export type ShapeNode = z.infer<typeof ShapeNodeSchema>;
export type ConnectorNode = z.infer<typeof ConnectorNodeSchema>;
export type ConnectorAnchor = z.infer<typeof ConnectorAnchorSchema>;
export type ConnectorEnd = z.infer<typeof ConnectorEndSchema>;
export type ConnectorMode = z.infer<typeof ConnectorModeSchema>;
export type ConnectorStrokeStyle = z.infer<typeof ConnectorStrokeStyleSchema>;
export type ConnectorEndpointStyle = z.infer<typeof ConnectorEndpointStyleSchema>;
export type ConnectorLabel = z.infer<typeof ConnectorLabelSchema>;
export type WorkspaceNode = z.infer<typeof WorkspaceNodeSchema>;
export type WorkspaceNodeType = WorkspaceNode["type"];
export type WorkspaceScene = z.infer<typeof WorkspaceSceneSchema>;

export type StudioItemType = WorkspaceNodeType;
export type StudioItem = WorkspaceNode;
export type StudioLayout = WorkspaceScene;

const DEFAULT_NODE_SIZE: Record<WorkspaceNodeType, { w: number; h: number }> = {
  text: { w: 280, h: 120 },
  "free-text": { w: 220, h: 64 },
  sticky: { w: 220, h: 220 },
  "pdf-page": { w: 500, h: 700 },
  "pdf-fragment": { w: 400, h: 500 },
  "video-anchor": { w: 200, h: 120 },
  image: { w: 320, h: 240 },
  group: { w: 400, h: 300 },
  drawing: { w: 100, h: 100 },
  shape: { w: 120, h: 120 },
  connector: { w: 1, h: 1 },
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function coerceNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coercePositiveNumber(value: unknown, fallback: number) {
  const parsed = coerceNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function coerceConnectorVec(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const [x, y] = value;
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
    ? [x, y]
    : undefined;
}

function coerceConnectorEnd(value: unknown): { id?: string; position?: [number, number] } {
  const record = asObject(value) ?? {};
  const id = typeof record.id === "string" && record.id.length > 0 ? record.id : undefined;
  const position = coerceConnectorVec(record.position);
  return { ...(id ? { id } : {}), ...(position ? { position } : {}) };
}

function legacyAnchorPosition(anchor: unknown): [number, number] | undefined {
  const parsed = ConnectorAnchorSchema.safeParse(anchor);
  return parsed.success ? [...CONNECTOR_ANCHOR_POSITIONS[parsed.data]] : undefined;
}

/**
 * Normalises connector props to the v2 model. v1 connectors
 * (`sourceId`/`sourceAnchor`/`targetId`/`targetAnchor`, straight only) are
 * converted to relative side positions and keep their straight appearance.
 */
function normalizeConnectorProps(props: Record<string, unknown>) {
  const isLegacy = !("source" in props) && !("target" in props) && ("sourceId" in props || "targetId" in props);
  const source = isLegacy
    ? { id: coerceString(props.sourceId) || undefined, position: legacyAnchorPosition(props.sourceAnchor) }
    : coerceConnectorEnd(props.source);
  const target = isLegacy
    ? { id: coerceString(props.targetId) || undefined, position: legacyAnchorPosition(props.targetAnchor) }
    : coerceConnectorEnd(props.target);
  const label = asObject(props.label);

  return {
    source,
    target,
    mode: ConnectorModeSchema.safeParse(props.mode).success
      ? props.mode
      : isLegacy ? "straight" : DEFAULT_CONNECTOR_MODE,
    color: coerceString(props.color, DEFAULT_CONNECTOR_COLOR),
    strokeWidth: coercePositiveNumber(props.strokeWidth, DEFAULT_CONNECTOR_STROKE_WIDTH),
    strokeStyle: ConnectorStrokeStyleSchema.safeParse(props.strokeStyle).success ? props.strokeStyle : "solid",
    frontEndpointStyle: ConnectorEndpointStyleSchema.safeParse(props.frontEndpointStyle).success
      ? props.frontEndpointStyle
      : "none",
    rearEndpointStyle: ConnectorEndpointStyleSchema.safeParse(props.rearEndpointStyle).success
      ? props.rearEndpointStyle
      : "arrow",
    ...(label && typeof label.text === "string" && label.text.length > 0
      ? { label: { text: label.text, offset: Math.min(1, Math.max(0, coerceNumber(label.offset, 0.5))) } }
      : {}),
  };
}

function coerceInteger(value: unknown, fallback: number) {
  return Math.trunc(coerceNumber(value, fallback));
}

function coercePositiveInteger(value: unknown, fallback: number) {
  const parsed = coerceInteger(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function coerceNonNegativeInteger(value: unknown, fallback: number) {
  const parsed = coerceInteger(value, fallback);
  return parsed >= 0 ? parsed : fallback;
}

function coerceString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function coerceOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function coercePointArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const points = value
    .map((point) => {
      const record = asObject(point);
      if (!record) return null;

      const x = coerceNumber(record.x, Number.NaN);
      const y = coerceNumber(record.y, Number.NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      const pressure = typeof record.pressure === "number" && Number.isFinite(record.pressure)
        ? Math.max(0, Math.min(1, record.pressure))
        : undefined;
      return { x, y, ...(pressure === undefined ? {} : { pressure }) };
    })
    .filter(Boolean) as Array<{ x: number; y: number }>;

  return points.length > 0 ? points : undefined;
}

function coerceViewport(value: unknown): WorkspaceViewport {
  const record = asObject(value);

  return WorkspaceViewportSchema.parse({
    x: coerceNumber(record?.x, DEFAULT_WORKSPACE_VIEWPORT.x),
    y: coerceNumber(record?.y, DEFAULT_WORKSPACE_VIEWPORT.y),
    zoom: coercePositiveNumber(record?.zoom, DEFAULT_WORKSPACE_VIEWPORT.zoom),
  });
}

function coerceCrop(value: unknown): PdfCrop {
  const record = asObject(value);

  return PdfCropSchema.parse({
    x: coerceNumber(record?.x, DEFAULT_PDF_CROP.x),
    y: coerceNumber(record?.y, DEFAULT_PDF_CROP.y),
    width: coercePositiveNumber(record?.width, DEFAULT_PDF_CROP.width),
    height: coercePositiveNumber(record?.height, DEFAULT_PDF_CROP.height),
  });
}

/** Keeps a valid lock flag and group id from legacy or partially valid props. */
function coerceElementMeta(props: Record<string, unknown>) {
  const groupId = coerceOptionalString(props.groupId);
  return {
    ...(typeof props.locked === "boolean" ? { locked: props.locked } : {}),
    ...(groupId ? { groupId } : {}),
  };
}

function buildNodeBase(raw: Record<string, unknown>) {
  return {
    id: coerceOptionalString(raw.id) ?? `item-${Math.random().toString(36).slice(2, 11)}`,
    x: coerceNumber(raw.x, 0),
    y: coerceNumber(raw.y, 0),
    w: coercePositiveNumber(raw.w, 300),
    h: coercePositiveNumber(raw.h, 200),
    rotation: coerceNumber(raw.rotation, 0),
    zIndex: coerceInteger(raw.zIndex, 1),
  };
}

function parseWorkspaceNode(input: unknown): WorkspaceNode | null {
  const parsed = WorkspaceNodeSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const record = asObject(input);
  if (!record) {
    return null;
  }

  const base = buildNodeBase(record);
  const props = asObject(record.props) ?? {};

  switch (record.type) {
    case "text":
      return TextNodeSchema.parse({
        ...base,
        type: "text",
        props: {
          ...coerceElementMeta(props),
          text: coerceString(props.text),
          color: coerceOptionalString(props.color),
          fontSize: typeof props.fontSize === "number" ? props.fontSize : undefined,
        },
      });
    case "free-text":
      return FreeTextNodeSchema.parse({
        ...base,
        type: "free-text",
        props: {
          ...coerceElementMeta(props),
          text: coerceString(props.text),
          color: coerceString(props.color, "#1e1e1e"),
          fontSize: typeof props.fontSize === "number" ? props.fontSize : 28,
        },
      });
    case "sticky":
      return StickyNodeSchema.parse({
        ...base,
        type: "sticky",
        props: {
          ...coerceElementMeta(props),
          text: coerceString(props.text),
          color: coerceOptionalString(props.color),
        },
      });
    case "pdf-page":
      return PdfPageNodeSchema.safeParse({
        ...base,
        type: "pdf-page",
        props: {
          ...coerceElementMeta(props),
          assetId: coerceString(props.assetId),
          revisionId: coerceOptionalString(props.revisionId),
          pageNumber: coercePositiveInteger(props.pageNumber, 1),
        },
      }).success
        ? PdfPageNodeSchema.parse({
            ...base,
            type: "pdf-page",
            props: {
              ...coerceElementMeta(props),
              assetId: coerceString(props.assetId),
              revisionId: coerceOptionalString(props.revisionId),
              pageNumber: coercePositiveInteger(props.pageNumber, 1),
            },
          })
        : null;
    case "pdf-fragment":
      return PdfFragmentNodeSchema.safeParse({
        ...base,
        type: "pdf-fragment",
        props: {
          ...coerceElementMeta(props),
          assetId: coerceString(props.assetId),
          revisionId: coerceOptionalString(props.revisionId),
          pageNumber: coercePositiveInteger(props.pageNumber, 1),
          crop: coerceCrop(props.crop),
          previewSrc: coerceOptionalString(props.previewSrc),
        },
      }).success
        ? PdfFragmentNodeSchema.parse({
            ...base,
            type: "pdf-fragment",
            props: {
              ...coerceElementMeta(props),
              assetId: coerceString(props.assetId),
              revisionId: coerceOptionalString(props.revisionId),
              pageNumber: coercePositiveInteger(props.pageNumber, 1),
              crop: coerceCrop(props.crop),
              previewSrc: coerceOptionalString(props.previewSrc),
            },
          })
        : null;
    case "video-anchor":
      return VideoAnchorNodeSchema.safeParse({
        ...base,
        type: "video-anchor",
        props: {
          ...coerceElementMeta(props),
          assetId: coerceString(props.assetId),
          revisionId: coerceOptionalString(props.revisionId),
          startTimeMs: coerceNonNegativeInteger(props.startTimeMs, 0),
          endTimeMs:
            typeof props.endTimeMs === "number"
              ? coerceNonNegativeInteger(props.endTimeMs, 0)
              : undefined,
          label: coerceOptionalString(props.label),
          notes: coerceOptionalString(props.notes),
          color: coerceString(props.color, "#F8E7A1"),
        },
      }).success
        ? VideoAnchorNodeSchema.parse({
            ...base,
            type: "video-anchor",
            props: {
              ...coerceElementMeta(props),
              assetId: coerceString(props.assetId),
              revisionId: coerceOptionalString(props.revisionId),
              startTimeMs: coerceNonNegativeInteger(props.startTimeMs, 0),
              endTimeMs:
                typeof props.endTimeMs === "number"
                  ? coerceNonNegativeInteger(props.endTimeMs, 0)
                  : undefined,
              label: coerceOptionalString(props.label),
              notes: coerceOptionalString(props.notes),
              color: coerceString(props.color, "#F8E7A1"),
            },
          })
        : null;
    case "image":
      return ImageNodeSchema.parse({
        ...base,
        type: "image",
        props: {
          ...coerceElementMeta(props),
          assetId: coerceOptionalString(props.assetId),
          src: coerceOptionalString(props.src),
          alt: coerceOptionalString(props.alt),
        },
      });
    case "group":
      return GroupNodeSchema.parse({
        ...base,
        type: "group",
        props: {
          ...coerceElementMeta(props),
          label: coerceOptionalString(props.label),
        },
      });
    case "drawing":
      return DrawingNodeSchema.parse({
        ...base,
        type: "drawing",
        props: {
          ...coerceElementMeta(props),
          d: coerceString(props.d),
          color: coerceString(props.color, "#4f46e5"),
          strokeWidth: typeof props.strokeWidth === "number" ? props.strokeWidth : 3,
          points: coercePointArray(props.points),
          outline: props.outline === true,
        },
      });
    case "connector": {
      // A connector with an unusable end is dropped on its own instead of
      // failing the whole scene parse (which would fall back to an empty scene).
      const connector = ConnectorNodeSchema.safeParse({
        ...base,
        type: "connector",
        props: { ...normalizeConnectorProps(props), ...coerceElementMeta(props) },
      });
      return connector.success ? connector.data : null;
    }
    case "shape": {
      const fillObj = asObject(props.fill) ?? {};
      const strokeObj = asObject(props.stroke) ?? {};
      return ShapeNodeSchema.parse({
        ...base,
        type: "shape",
        props: {
          kind: typeof props.kind === "string" ? props.kind : "rectangle",
          fill: {
            type: fillObj.type === "transparent" ? "transparent" : "solid",
            color: coerceString(fillObj.color, "#e0e7ff"),
          },
          stroke: {
            width: typeof strokeObj.width === "number" ? strokeObj.width : 2,
            color: coerceString(strokeObj.color, "#6366f1"),
            style: ["solid", "dashed", "dotted"].includes(strokeObj.style as string)
              ? strokeObj.style
              : "solid",
          },
          cornerRadius: typeof props.cornerRadius === "number" ? props.cornerRadius : 0,
          opacity: typeof props.opacity === "number" ? props.opacity : 100,
          shadow: typeof props.shadow === "boolean" ? props.shadow : false,
          locked: typeof props.locked === "boolean" ? props.locked : false,
          groupId: coerceOptionalString(props.groupId),
          startPoint: props.startPoint && typeof props.startPoint === "object"
            ? { x: coerceNumber((props.startPoint as any).x, 0), y: coerceNumber((props.startPoint as any).y, 0) }
            : undefined,
          endPoint: props.endPoint && typeof props.endPoint === "object"
            ? { x: coerceNumber((props.endPoint as any).x, 0), y: coerceNumber((props.endPoint as any).y, 0) }
            : undefined,
        },
      });
    }
    default:
      return null;
  }
}

export function parseWorkspaceScene(value: unknown): WorkspaceScene {
  const parsed = WorkspaceSceneSchema.safeParse(value);
  if (parsed.success) {
    // Connectors attached to a missing element cannot render; older snapshots
    // may contain them because some deletions did not cascade.
    return { ...parsed.data, items: withoutOrphanConnectors(parsed.data.items) };
  }

  const record = asObject(value);
  const items = Array.isArray(record?.items)
    ? withoutOrphanConnectors(record.items.map(parseWorkspaceNode).filter((node): node is WorkspaceNode => node !== null))
    : [];
  
  const workspaceAssetIds = Array.isArray(record?.workspaceAssetIds)
    ? record.workspaceAssetIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  return WorkspaceSceneSchema.parse({
    format: WORKSPACE_SCENE_FORMAT,
    version: WORKSPACE_SCENE_VERSION,
    items,
    workspaceAssetIds,
    viewport: coerceViewport(record?.viewport),
  });
}

export function parseWorkspaceSceneJson(sceneJson?: string | null): WorkspaceScene {
  if (!sceneJson) {
    return createWorkspaceScene();
  }

  try {
    return parseWorkspaceScene(JSON.parse(sceneJson));
  } catch {
    return createWorkspaceScene();
  }
}

export function createWorkspaceScene(
  input?: Partial<Pick<WorkspaceScene, "items" | "viewport" | "workspaceAssetIds">>,
) {
  return WorkspaceSceneSchema.parse({
    format: WORKSPACE_SCENE_FORMAT,
    version: WORKSPACE_SCENE_VERSION,
    items: input?.items ?? [],
    workspaceAssetIds: input?.workspaceAssetIds ?? [],
    viewport: input?.viewport ?? DEFAULT_WORKSPACE_VIEWPORT,
  });
}

export function serializeWorkspaceScene(
  input?: Partial<Pick<WorkspaceScene, "items" | "viewport" | "workspaceAssetIds">>,
) {
  return JSON.stringify(createWorkspaceScene(input));
}

export function createWorkspaceItem(
  type: WorkspaceNodeType,
  props: unknown,
  options: {
    id?: string;
    x: number;
    y: number;
    zIndex: number;
  },
): WorkspaceNode | null {
  const propRecord = asObject(props) ?? {};
  const fallbackSize = DEFAULT_NODE_SIZE[type];
  const base = {
    id:
      options.id ??
      `item-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 11)}`,
    x: options.x,
    y: options.y,
    w: coercePositiveNumber(propRecord.w, fallbackSize.w),
    h: coercePositiveNumber(propRecord.h, fallbackSize.h),
    rotation: coerceNumber(propRecord.rotation, 0),
    zIndex: options.zIndex,
    props: propRecord,
    type,
  };

  return parseWorkspaceNode(base);
}

export function getWorkspaceNodeText(node: WorkspaceNode) {
  switch (node.type) {
    case "text":
    case "sticky":
      return node.props.text.trim();
    case "video-anchor":
      return [node.props.label, node.props.notes].filter(Boolean).join(" ").trim();
    case "image":
      return (node.props.alt ?? "").trim();
    case "group":
      return (node.props.label ?? "").trim();
    default:
      return "";
  }
}
