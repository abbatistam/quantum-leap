import { CropCommandJSON } from "../../types/commands.types";
import { Matrix3x3, Rect } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { isValidRect } from "../../utils/utils";
import { MatrixUtils } from "../matrix/MatrixUtils";
import { TransformCommand } from "./TransformCommand";

export class CropCommand implements TransformCommand {
  readonly name = "crop";
  private readonly internalRect: Readonly<Rect>;

  constructor(rect: Rect) {
    if (!isValidRect(rect) || rect.width <= 0 || rect.height <= 0)
      throw new MatrixError(
        `Invalid rectangle for CropCommand`,
        "INVALID_RECT"
      );
    this.internalRect = Object.freeze({ ...rect });
  }

  /**
   * Executes crop. Returns a *new* identity matrix.
   * Input matrix is discarded (garbage collected).
   */
  execute(matrix: Matrix3x3): Matrix3x3 {
    // Input matrix 'matrix' is no longer needed, GC will handle it.
    return MatrixUtils.identity(); // Return a new identity matrix
  }
  getRect(): Rect {
    return { ...this.internalRect };
  }
  toString(): string {
    return `Crop to (${this.internalRect.x}, ${this.internalRect.y}, ${this.internalRect.width}×${this.internalRect.height})`;
  }
  toJSON(): CropCommandJSON {
    return { type: "crop", rect: this.getRect() };
  }
  // No releaseResources
}
