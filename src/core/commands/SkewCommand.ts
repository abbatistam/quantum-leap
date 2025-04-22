import { SkewCommandJSON } from "../../types/commands.types";
import { Matrix3x3 } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { isValidNumber } from "../../utils/utils";
import { MatrixUtils } from "../matrix/MatrixUtils";
import { TransformCommand } from "./TransformCommand";

export class SkewCommand implements TransformCommand {
  readonly name = "skew";
  private readonly skewX: number;
  private readonly skewY: number;

  constructor(skewX: number, skewY: number) {
    if (!isValidNumber(skewX))
      throw new MatrixError(`Invalid skew angle X: ${skewX}`, "INVALID_SKEW");
    if (!isValidNumber(skewY))
      throw new MatrixError(`Invalid skew angle Y: ${skewY}`, "INVALID_SKEW");
    this.skewX = skewX;
    this.skewY = skewY;
  }

  execute(matrix: Matrix3x3): Matrix3x3 {
    const tx = Math.tan(this.skewX);
    const ty = Math.tan(this.skewY);
    // Create skew matrix directly (no pool)
    const skewMatrix = new Float32Array([
      1,
      tx,
      0,
      ty,
      1,
      0,
      0,
      0,
      1,
    ]) as Matrix3x3;
    return MatrixUtils.multiply(skewMatrix, matrix);
  }
  toString(): string {
    return `Skew (${this.skewX.toFixed(2)} rad, ${this.skewY.toFixed(2)} rad)`;
  }
  toJSON(): SkewCommandJSON {
    return { type: "skew", skewX: this.skewX, skewY: this.skewY };
  }
  // No releaseResources
}
