import { ScaleCommandJSON } from "../../types/commands.types";
import { Matrix3x3, Point } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { isValidNumber, isValidPoint } from "../../utils/utils";
import { MatrixUtils } from "../matrix/MatrixUtils";
import { TransformCommand } from "./TransformCommand";

export class ScaleCommand implements TransformCommand {
  readonly name = "scale";
  private readonly sx: number;
  private readonly sy: number;
  private readonly center?: Point;

  constructor(sx: number, sy: number, center?: Point) {
    if (!isValidNumber(sx))
      throw new MatrixError(`Invalid scale factor X: ${sx}`, "INVALID_SCALE_X");
    if (!isValidNumber(sy))
      throw new MatrixError(`Invalid scale factor Y: ${sy}`, "INVALID_SCALE_Y");
    if (
      Math.abs(sx) < MatrixUtils.getEpsilon() ||
      Math.abs(sy) < MatrixUtils.getEpsilon()
    )
      throw new MatrixError(`Scale factors cannot be zero`, "ZERO_SCALE");
    if (center !== undefined && !isValidPoint(center))
      throw new MatrixError(`Invalid center point`, "INVALID_POINT");
    this.sx = sx;
    this.sy = sy;
    this.center = center ? { ...center } : undefined;
  }

  execute(matrix: Matrix3x3): Matrix3x3 {
    const scaleMatrix = this.center
      ? MatrixUtils.scalingAround(this.sx, this.sy, this.center)
      : MatrixUtils.scaling(this.sx, this.sy);
    return MatrixUtils.multiply(scaleMatrix, matrix);
  }
  toString(): string {
    /* ... (no change) ... */
    const centerStr = this.center
      ? ` around (${this.center.x.toFixed(1)},${this.center.y.toFixed(1)})`
      : "";
    return `Scale (${this.sx.toFixed(2)}, ${this.sy.toFixed(2)})${centerStr}`;
  }
  toJSON(): ScaleCommandJSON {
    /* ... (no change) ... */
    const data: ScaleCommandJSON = { type: "scale", sx: this.sx, sy: this.sy };
    if (this.center) {
      data.center = { ...this.center };
    }
    return data;
  }
}
