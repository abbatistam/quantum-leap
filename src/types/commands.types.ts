import type { Point, Rect } from "./core.types";

export interface BaseCommandJSON {
  type: string; // 'rotate', 'scale', etc.
}

export interface RotateCommandJSON extends BaseCommandJSON {
  type: "rotate";
  angle: number;
  center?: Point;
}

export interface ScaleCommandJSON extends BaseCommandJSON {
  type: "scale";
  sx: number;
  sy: number;
  center?: Point;
}

export interface TranslateCommandJSON extends BaseCommandJSON {
  type: "translate";
  dx: number;
  dy: number;
}

export interface CropCommandJSON extends BaseCommandJSON {
  type: "crop";
  rect: Rect;
}

export interface ResizeCommandJSON extends BaseCommandJSON {
  type: "resize";
  width: number;
  height: number;
}

export interface SkewCommandJSON extends BaseCommandJSON {
  type: "skew";
  skewX: number;
  skewY: number;
}

export interface PerspectiveCommandJSON extends BaseCommandJSON {
  type: "perspective";
  sourcePoints: Point[];
  destPoints: Point[];
}

export interface CustomCommandJSON extends BaseCommandJSON {
  type: "custom";
  matrix: number[];
  desc: string;
}

// Union type para cualquier JSON de comando válido (opcional pero útil)
export type AnyCommandJSON =
  | RotateCommandJSON
  | ScaleCommandJSON
  | TranslateCommandJSON
  | CropCommandJSON
  | ResizeCommandJSON
  | SkewCommandJSON
  | PerspectiveCommandJSON
  | CustomCommandJSON;
