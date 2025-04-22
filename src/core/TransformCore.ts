// src/core/TransformCore.ts

import { Dimensions, Matrix3x3, Point, Rect } from "../types/core.types"; // Ajusta ruta
import { isValidPoint, isValidRect } from "../utils/utils"; // Ajusta ruta
import { isDimensionCommand, TransformCommand } from "./commands"; // Ajusta ruta
import { MatrixUtils } from "./matrix/MatrixUtils"; // Ajusta ruta

/**
 * Manages the core transformation state (matrix and dimensions).
 * Relies on standard object creation and garbage collection.
 */
export class TransformCore {
  private matrix: Matrix3x3;
  private imageWidth: number;
  private imageHeight: number;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || width <= 0)
      throw new Error("Initial width must be positive integer.");
    if (!Number.isInteger(height) || height <= 0)
      throw new Error("Initial height must be positive integer.");
    this.imageWidth = width;
    this.imageHeight = height;
    this.matrix = MatrixUtils.identity(); // Síncrono
  }

  getMatrix(): Matrix3x3 {
    return MatrixUtils.clone(this.matrix); // Síncrono
  }

  setMatrix(m: Matrix3x3): void {
    // Síncrono
    if (!(m instanceof Float32Array && m.length === 9)) {
      console.error(
        "TransformCore.setMatrix: Invalid matrix. State not changed.",
        m,
      );
      return;
    }
    this.matrix = MatrixUtils.clone(m); // Síncrono
  }

  getDimensions(): Dimensions {
    /* ... sin cambios ... */ return {
      width: this.imageWidth,
      height: this.imageHeight,
    };
  }
  setDimensions(dims: Dimensions): void {
    /* ... sin cambios ... */ if (
      dims &&
      Number.isInteger(dims.width) &&
      dims.width > 0 &&
      Number.isInteger(dims.height) &&
      dims.height > 0
    ) {
      this.imageWidth = dims.width;
      this.imageHeight = dims.height;
    } else if (process.env.NODE_ENV !== "production") {
      console.warn("TransformCore.setDimensions: Invalid dimensions.", dims);
    }
  }

  /** Applies a command. Updates internal matrix and potentially dimensions. (ASÍNCRONO) */
  async applyCommand(cmd: TransformCommand): Promise<void> {
    // <--- async + Promise<void>
    if (!cmd || typeof cmd.execute !== "function") {
      console.error("TransformCore.applyCommand: Invalid command.", cmd);
      return;
    }

    try {
      // Esperar el resultado de execute (que es Promise<Matrix3x3>)
      this.matrix = await cmd.execute(this.matrix); // <--- await aquí

      // Update Dimensions if applicable (sigue síncrono)
      if (isDimensionCommand(cmd)) {
        const newDims = cmd.getDimensions();
        if (
          newDims &&
          Number.isInteger(newDims.width) &&
          newDims.width > 0 &&
          Number.isInteger(newDims.height) &&
          newDims.height > 0
        ) {
          this.imageWidth = newDims.width;
          this.imageHeight = newDims.height;
        } else {
          console.warn(`Command '${cmd.name}' returned invalid dimensions.`);
        }
      }
    } catch (error) {
      console.error(
        `Error executing command '${cmd.name}'. Resetting matrix to identity.`,
        error,
      );
      this.matrix = MatrixUtils.identity(); // Síncrono
    }
  }

  /** Resets the internal transformation matrix to identity. (Síncrono) */
  resetMatrix(): void {
    this.matrix = MatrixUtils.identity(); // Síncrono
  }

  // transformPoint y transformRect siguen síncronos si usan MatrixUtils.transformPoint (JS)
  transformPoint(p: Point, out?: Point): Point {
    /* ... sin cambios ... */ if (!isValidPoint(p)) {
      console.error("TransformCore.transformPoint: Invalid input point.", p);
      const d = out ?? { x: 0, y: 0 };
      d.x = NaN;
      d.y = NaN;
      return d;
    }
    return MatrixUtils.transformPoint(this.matrix, p, out);
  }
  transformRect(r: Rect, out?: Rect): Rect {
    /* ... sin cambios ... */ if (!isValidRect(r)) {
      console.error("TransformCore.transformRect: Invalid input rect.", r);
      const d = out ?? { x: 0, y: 0, width: 0, height: 0 };
      d.x = NaN;
      d.y = NaN;
      d.width = NaN;
      d.height = NaN;
      return d;
    }
    return MatrixUtils.transformRect(this.matrix, r, out);
  }
}
