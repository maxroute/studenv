"use client";

import { 
  BaseBoxShapeUtil, 
  HTMLContainer, 
  TLBaseShape 
} from "@tldraw/tldraw";
import type { RecordProps } from "@tldraw/tlschema";
import { T } from "@tldraw/validate";
import { Play } from "lucide-react";

export type VideoAnchorShape = TLBaseShape<
  "video-anchor",
  {
    assetId: string;
    revisionId?: string;
    startTimeMs: number;
    endTimeMs?: number;
    w: number;
    h: number;
    label: string;
  }
>;

export class VideoAnchorShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = "video-anchor" as const;
  static override props: RecordProps<VideoAnchorShape> = {
    assetId: T.string,
    revisionId: T.string.optional(),
    startTimeMs: T.number,
    endTimeMs: T.number.optional(),
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    label: T.string,
  };

  override getDefaultProps(): VideoAnchorShape["props"] {
    return {
      assetId: "",
      revisionId: "",
      startTimeMs: 0,
      w: 200,
      h: 120,
      label: "Video Anchor",
    };
  }

  override hideRotateHandle() {
    return false;
  }

  override component(shape: VideoAnchorShape) {
    return (
      <HTMLContainer className="pointer-events-none border bg-white flex flex-col items-center justify-center overflow-hidden rounded-md shadow-sm">
        <div className="bg-slate-800 w-full p-1 text-[10px] font-mono text-white flex justify-between items-center px-2">
           <Play className="w-3 h-3 fill-white" />
           <span>{(shape.props.startTimeMs / 1000).toFixed(1)}s</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-2 text-center">
           <span className="text-xs font-medium text-slate-700">{shape.props.label}</span>
           <span className="text-[10px] text-slate-400">Jump to frame</span>
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: VideoAnchorShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} ry={6} />;
  }
}
