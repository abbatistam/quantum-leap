import { RotateCommandJSON } from "../../types/commands.types";
import { Matrix3x3, Point } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { isValidNumber, isValidPoint } from "../../utils/utils";
import { MatrixUtils } from "../matrix/MatrixUtils";
import { TransformCommand } from "./TransformCommand";

export class RotateCommand implements TransformCommand {
  readonly name = "rotate";
  private readonly angle: number;
  private readonly center?: Point;

  constructor(angle: number, center?: Point) {
    if (!isValidNumber(angle))
      throw new MatrixError(`Invalid angle: ${angle}`, "INVALID_ANGLE");
    if (center !== undefined && !isValidPoint(center))
      throw new MatrixError(`Invalid center point`, "INVALID_POINT");
    this.angle = angle;
    this.center = center ? { ...center } : undefined;
  }

  execute(matrix: Matrix3x3): Matrix3x3 {
    // MatrixUtils methods now return new matrices
    const rotMatrix = this.center
      ? MatrixUtils.rotationAround(this.angle, this.center)
      : MatrixUtils.rotation(this.angle);
    // multiply returns a new matrix. rotMatrix is garbage collected.
    // The input 'matrix' is also garbage collected if not referenced elsewhere.
    return MatrixUtils.multiply(rotMatrix, matrix);
  }

  toString(): string {
    /* ... (no change) ... */
    const deg = ((this.angle * 180) / Math.PI).toFixed(1);
    const centerStr = this.center
      ? ` around (${this.center.x.toFixed(1)},${this.center.y.toFixed(1)})`
      : "";
    return `Rotate ${deg}°${centerStr}`;
  }
  toJSON(): RotateCommandJSON {
    /* ... (no change) ... */
    const data: RotateCommandJSON = { type: "rotate", angle: this.angle };
    if (this.center) {
      data.center = { ...this.center };
    }
    return data;
  }
}
