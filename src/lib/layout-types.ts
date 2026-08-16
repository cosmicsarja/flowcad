/**
 * layout-types.ts
 * TypeScript interfaces mirroring the Python LayoutOutput Pydantic model
 * from backend/services/layout_extractor.py.
 * These are the field names the frontend binds to directly.
 */

export interface PlacedComponent {
  ref: string; // e.g. "U1"
  name: string; // human name
  footprint: string; // KiCad footprint id
  x_mm: number; // left edge from board origin
  y_mm: number; // top edge from board origin
  w_mm: number; // bounding-box width
  h_mm: number; // bounding-box height
  layer: "F.Cu" | "B.Cu";
  rotation: number; // degrees
}

export interface RouteSegment {
  net: string;
  x1_mm: number;
  y1_mm: number;
  x2_mm: number;
  y2_mm: number;
  width_mm: number;
  layer: "F.Cu" | "B.Cu";
}

export interface LayoutPad {
  ref: string;
  pad_num: number;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  net: string;
  layer: "F.Cu" | "B.Cu";
}

export interface LayoutVia {
  x_mm: number;
  y_mm: number;
  drill_mm: number;
  outer_mm: number;
  net: string;
}

export interface MountingHole {
  x_mm: number;
  y_mm: number;
  drill_mm: number;
}

export interface KeepoutZone {
  label: string;
  /** (x_mm, y_mm) vertex pairs forming a closed polygon */
  polygon: [number, number][];
}

export interface LayoutData {
  board_w_mm: number;
  board_h_mm: number;
  layers: number;
  placement: PlacedComponent[];
  routing: RouteSegment[];
  /** net class name → trace width in mm */
  trace_widths: Record<string, number>;
  pads: LayoutPad[];
  vias: LayoutVia[];
  mounting_holes: MountingHole[];
  keepouts: KeepoutZone[];
  /** net name → list of component refs on that net */
  net_index: Record<string, string[]>;
  data_source: "kicad" | "computed";
  project_id?: string;
}

/** Backend SchematicOutput shape as stored in design_state.netlist */
export interface NetlistData {
  netlist_path: string;
  nets: Array<{ from_ref: string; to_ref: string; net: string }>;
  parts: Array<Record<string, unknown>>;
  net_count: number;
  part_count: number;
  project_id?: string;
}
