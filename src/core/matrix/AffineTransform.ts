import { Matrix3x3, Point, Rect } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { isValidNumber } from "../../utils/utils"; // Asume que existe
import { MatrixUtils } from "./MatrixUtils";

export class AffineTransform {
  matrix: Matrix3x3;

  constructor(initialMatrix?: Matrix3x3) {
    if (initialMatrix !== undefined) {
      if (
        !(initialMatrix instanceof Float32Array && initialMatrix.length === 9)
      ) {
        throw new MatrixError(
          "Invalid matrix provided to AffineTransform constructor",
          "INVALID_MATRIX",
        );
      }
      this.matrix = MatrixUtils.clone(initialMatrix);
    } else {
      this.matrix = MatrixUtils.identity();
    }
  }

  static fromMatrix(matrix: Matrix3x3): AffineTransform {
    return new AffineTransform(matrix);
  }

  // --- Métodos Mutables (Siguen Síncronos porque usan multiplyInPlace) ---

  translate(dx: number, dy: number): this {
    if (!isValidNumber(dx)) dx = 0;
    if (!isValidNumber(dy)) dy = 0;
    const t = MatrixUtils.translation(dx, dy);
    MatrixUtils.multiplyInPlace(t, this.matrix, this.matrix);
    return this;
  }

  scale(sx: number, sy: number): this {
    if (!isValidNumber(sx)) sx = 1;
    if (!isValidNumber(sy)) sy = 1;
    const s = MatrixUtils.scaling(sx, sy);
    MatrixUtils.multiplyInPlace(s, this.matrix, this.matrix);
    return this;
  }

  rotate(angle: number): this {
    if (!isValidNumber(angle)) angle = 0;
    const r = MatrixUtils.rotation(angle);
    MatrixUtils.multiplyInPlace(r, this.matrix, this.matrix);
    return this;
  }

  compose(other: AffineTransform): this {
    if (!other || !(other instanceof AffineTransform))
      throw new Error("Compose requires a valid AffineTransform.");
    MatrixUtils.multiplyInPlace(other.matrix, this.matrix, this.matrix);
    return this;
  }

  reset(): this {
    this.matrix = MatrixUtils.identity(); // Asigna nueva identidad síncrona
    return this;
  }

  // --- Métodos Inmutables (AHORA ASÍNCRONOS) ---

  async translated(dx: number, dy: number): Promise<AffineTransform> {
    // async + Promise
    if (!isValidNumber(dx)) dx = 0;
    if (!isValidNumber(dy)) dy = 0;
    const t = MatrixUtils.translation(dx, dy);
    const newMatrix = await MatrixUtils.multiply(t, this.matrix); // await
    return new AffineTransform(newMatrix);
  }

  async scaled(sx: number, sy: number): Promise<AffineTransform> {
    // async + Promise
    if (!isValidNumber(sx)) sx = 1;
    if (!isValidNumber(sy)) sy = 1;
    const s = MatrixUtils.scaling(sx, sy);
    const newMatrix = await MatrixUtils.multiply(s, this.matrix); // await
    return new AffineTransform(newMatrix);
  }

  async rotated(angle: number): Promise<AffineTransform> {
    // async + Promise
    if (!isValidNumber(angle)) angle = 0;
    const r = MatrixUtils.rotation(angle);
    const newMatrix = await MatrixUtils.multiply(r, this.matrix); // await
    return new AffineTransform(newMatrix);
  }

  async composed(other: AffineTransform): Promise<AffineTransform> {
    // async + Promise
    if (!other || !(other instanceof AffineTransform))
      throw new Error("Composed requires a valid AffineTransform.");
    const newMatrix = await MatrixUtils.multiply(other.matrix, this.matrix); // await
    return new AffineTransform(newMatrix);
  }

  // --- Otros Métodos ---

  async invert(): Promise<AffineTransform | null> {
    // async + Promise, devuelve null si falla
    const invertedMatrixResult = await MatrixUtils.inverse(this.matrix); // await
    if (!invertedMatrixResult) {
      return null; // Propagar el fallo de inversión
    }
    return new AffineTransform(invertedMatrixResult);
  }

  // applyToPoint y applyToRect siguen síncronos si usan la versión JS de transformPoint/Rect
  // Si quisiéramos usar transformPointsBatchWasm aquí, estos también serían async
  applyToPoint(point: Point, out?: Point): Point {
    // Asume que usamos la versión JS síncrona por ahora
    return MatrixUtils.transformPoint(this.matrix, point, out);
  }

  applyToRect(rect: Rect, out?: Rect): Rect {
    // Asume que usamos la versión JS síncrona por ahora
    return MatrixUtils.transformRect(this.matrix, rect, out);
  }

  // Métodos estáticos siguen síncronos (crean nuevas instancias)
  static fromTranslation(tx: number, ty: number): AffineTransform {
    const matrix = MatrixUtils.translation(tx, ty);
    return new AffineTransform(matrix);
  }
  static fromRotation(angle: number): AffineTransform {
    const matrix = MatrixUtils.rotation(angle);
    return new AffineTransform(matrix);
  }
  static fromScaling(sx: number, sy: number): AffineTransform {
    const matrix = MatrixUtils.scaling(sx, sy);
    return new AffineTransform(matrix);
  }

  clone(): AffineTransform {
    return new AffineTransform(this.matrix);
  }
  toMatrix(): Matrix3x3 {
    return MatrixUtils.clone(this.matrix);
  }
}
