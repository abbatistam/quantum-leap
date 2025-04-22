import { ResizeCommandJSON } from "../../types/commands.types";
import { Dimensions, Matrix3x3 } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { MatrixUtils } from "../matrix/MatrixUtils";
import { DimensionCommand, TransformCommand } from "./TransformCommand";

export class ResizeCommand implements TransformCommand, DimensionCommand {
  readonly name = "resize";
  private readonly width: number;
  private readonly height: number;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || width <= 0)
      throw new MatrixError(`Invalid width for ResizeCommand`, "INVALID_WIDTH");
    if (!Number.isInteger(height) || height <= 0)
      throw new MatrixError(
        `Invalid height for ResizeCommand`,
        "INVALID_HEIGHT"
      );
    this.width = width;
    this.height = height;
  }

  /**
   * Executes resize. Returns a *new* identity matrix.
   * Input matrix is discarded (garbage collected).
   */
  execute(matrix: Matrix3x3): Matrix3x3 {
    return MatrixUtils.identity();
  }
  getDimensions(): Dimensions {
    return { width: this.width, height: this.height };
  }
  toString(): string {
    return `Resize to ${this.width}×${this.height}`;
  }
  toJSON(): ResizeCommandJSON {
    return { type: "resize", width: this.width, height: this.height };
  }
  // No releaseResources
}
