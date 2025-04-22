import { CustomCommandJSON } from "../../types/commands.types";
import { Matrix3x3 } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { MatrixUtils } from "../matrix/MatrixUtils";
import { TransformCommand } from "./TransformCommand";

export class CustomTransformCommand implements TransformCommand {
  readonly name = "custom";
  private readonly mat: Matrix3x3; // Stores a *copy* or the original if needed
  private readonly desc: string;
  // No isReleased, no ownsMatrix

  constructor(mat: Matrix3x3, desc: string = "Custom") {
    if (!(mat instanceof Float32Array && mat.length === 9)) {
      throw new MatrixError(
        "Invalid matrix for CustomTransformCommand",
        "INVALID_MATRIX"
      );
    }
    // Store a clone to ensure command holds its own state if mat is modified externally
    this.mat = MatrixUtils.clone(mat); // Clone uses non-pooling version now
    this.desc = desc;
  }

  execute(matrix: Matrix3x3): Matrix3x3 {
    // multiply returns a new matrix. this.mat is unaffected.
    return MatrixUtils.multiply(this.mat, matrix);
  }
  toString(): string {
    return this.desc;
  }
  toJSON(): CustomCommandJSON {
    return { type: "custom", matrix: Array.from(this.mat), desc: this.desc };
  }
  // No releaseResources
}
