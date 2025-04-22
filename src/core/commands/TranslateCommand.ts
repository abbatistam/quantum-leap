import { TranslateCommandJSON } from "../../types/commands.types";
import { Matrix3x3 } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { isValidNumber } from "../../utils/utils";
import { MatrixUtils } from "../matrix/MatrixUtils";
import { TransformCommand } from "./TransformCommand";

export class TranslateCommand implements TransformCommand {
  readonly name = "translate";
  private readonly dx: number;
  private readonly dy: number;

  constructor(dx: number, dy: number) {
    if (!isValidNumber(dx))
      throw new MatrixError(
        `Invalid translation X: ${dx}`,
        "INVALID_TRANSLATION_X"
      );
    if (!isValidNumber(dy))
      throw new MatrixError(
        `Invalid translation Y: ${dy}`,
        "INVALID_TRANSLATION_Y"
      );
    this.dx = dx;
    this.dy = dy;
  }

  execute(matrix: Matrix3x3): Matrix3x3 {
    const transMatrix = MatrixUtils.translation(this.dx, this.dy);
    return MatrixUtils.multiply(transMatrix, matrix);
  }
  toString(): string {
    /* ... (no change) ... */ return `Translate (${this.dx.toFixed(1)}, ${this.dy.toFixed(1)})`;
  }
  toJSON(): TranslateCommandJSON {
    /* ... (no change) ... */ return {
      type: "translate",
      dx: this.dx,
      dy: this.dy,
    };
  }
}
