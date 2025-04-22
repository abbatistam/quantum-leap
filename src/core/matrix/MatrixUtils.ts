import { CONFIG } from "../../constants/config";
import { Matrix3x3, Point, Rect } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { isValidNumber, isValidPoint, isValidRect } from "../../utils/utils";
import { TransformCommand } from "../commands";
// Importar SOLO los wrappers WASM que SÍ usaremos
import {
  // multiplyWasm, // NO USADO
  // inverseWasm, // NO USADO
  // determinantWasm, // NO USADO
  transformPointsBatchWasm_Copy, // SÍ USADO
} from "../wasm/wasm-loader";

export class MatrixUtils {
  private static epsilon: number = CONFIG.EPSILON;

  static setEpsilon(v: number): void {
    if (isValidNumber(v) && v > 0) this.epsilon = v;
    else
      console.warn(
        `MatrixUtils.setEpsilon: Invalid epsilon value provided: ${v}`
      );
  }

  static getEpsilon(): number {
    return this.epsilon;
  }

  /**
   * Combines a sequence of `TransformCommand` objects into a single transformation matrix. (SÍNCRONO)
   */
  // --- CAMBIO: Quitar async ---
  static combine(commands: TransformCommand[]): Matrix3x3 {
    if (!Array.isArray(commands)) {
      console.error("MatrixUtils.combine: Input 'commands' must be an array.");
      return this.identity();
    }
    if (commands.length === 0) {
      return this.identity();
    }

    let m = this.identity();
    try {
      for (const cmd of commands) {
        if (!cmd || typeof cmd.execute !== "function") {
          console.warn(
            "MatrixUtils.combine: Encountered invalid command object.",
            cmd
          );
          continue;
        }
        // --- CAMBIO: Llamada síncrona ---
        m = cmd.execute(m); // Asume que execute es síncrono ahora
      }
    } catch (error) {
      console.error("Error during MatrixUtils.combine execution:", error);
      throw error;
    }
    return m;
  }

  /**
   * Returns a *new* identity matrix. (Síncrono - Sin Cambios)
   */
  static identity(): Matrix3x3 {
    // ... (sin cambios) ...
    const m = new Float32Array(9) as Matrix3x3;
    m[0] = 1;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = 1;
    m[5] = 0;
    m[6] = 0;
    m[7] = 0;
    m[8] = 1;
    return m;
  }

  /**
   * Sets the target matrix to the identity matrix in place. (Síncrono - Sin Cambios)
   */
  static identityInPlace(target: Matrix3x3): void {
    // ... (sin cambios) ...
    if (!(target instanceof Float32Array && target.length === 9))
      throw new MatrixError(
        "Invalid target matrix for identityInPlace",
        "INVALID_MATRIX"
      );
    target[0] = 1;
    target[1] = 0;
    target[2] = 0;
    target[3] = 0;
    target[4] = 1;
    target[5] = 0;
    target[6] = 0;
    target[7] = 0;
    target[8] = 1;
  }

  /**
   * Creates a *new* copy of a matrix. (Síncrono - Sin Cambios)
   */
  static clone(m: Matrix3x3): Matrix3x3 {
    // ... (sin cambios) ...
    if (!(m instanceof Float32Array && m.length === 9))
      throw new MatrixError(
        "Invalid matrix provided to clone()",
        "INVALID_MATRIX"
      );
    const out = new Float32Array(9) as Matrix3x3;
    out.set(m);
    return out;
  }

  /**
   * Checks if a matrix represents an affine transformation. (Síncrono - Sin Cambios)
   */
  static isAffine(m: Matrix3x3): boolean {
    // ... (sin cambios) ...
    if (!(m instanceof Float32Array && m.length === 9))
      throw new MatrixError(
        "Invalid matrix provided to isAffine()",
        "INVALID_MATRIX"
      );
    return (
      Math.abs(m[2]) < this.epsilon &&
      Math.abs(m[5]) < this.epsilon &&
      Math.abs(m[8] - 1) < this.epsilon
    );
  }

  /**
   * Multiplies two matrices (a * b) using JS. (SÍNCRONO)
   * Returns a *new* matrix.
   */
  // --- CAMBIO: Síncrono, implementación JS ---
  static multiply(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
    if (!(a instanceof Float32Array && a.length === 9))
      throw new MatrixError(
        "Invalid left matrix (a) for multiply",
        "INVALID_MATRIX"
      );
    if (!(b instanceof Float32Array && b.length === 9))
      throw new MatrixError(
        "Invalid right matrix (b) for multiply",
        "INVALID_MATRIX"
      );

    const out = this.identity(); // Crear matriz de salida
    this.multiplyInPlace(a, b, out); // Usar la implementación in-place
    return out;
  }

  /**
   * Multiplies two matrices (a * b) and stores the result in the `target` matrix using JS. (Síncrono - Sin Cambios)
   */
  static multiplyInPlace(a: Matrix3x3, b: Matrix3x3, target: Matrix3x3): void {
    // ... (sin cambios - ya era JS síncrono) ...
    if (!(a instanceof Float32Array && a.length === 9))
      throw new MatrixError(
        "Invalid left matrix (a) for multiplyInPlace",
        "INVALID_MATRIX"
      );
    if (!(b instanceof Float32Array && b.length === 9))
      throw new MatrixError(
        "Invalid right matrix (b) for multiplyInPlace",
        "INVALID_MATRIX"
      );
    if (!(target instanceof Float32Array && target.length === 9))
      throw new MatrixError(
        "Invalid target matrix for multiplyInPlace",
        "INVALID_MATRIX"
      );
    const a0 = a[0],
      a1 = a[1],
      a2 = a[2],
      a3 = a[3],
      a4 = a[4],
      a5 = a[5],
      a6 = a[6],
      a7 = a[7],
      a8 = a[8];
    const b0 = b[0],
      b1 = b[1],
      b2 = b[2],
      b3 = b[3],
      b4 = b[4],
      b5 = b[5],
      b6 = b[6],
      b7 = b[7],
      b8 = b[8];
    const t0 = a0 * b0 + a3 * b1 + a6 * b2;
    const t1 = a1 * b0 + a4 * b1 + a7 * b2;
    const t2 = a2 * b0 + a5 * b1 + a8 * b2;
    const t3 = a0 * b3 + a3 * b4 + a6 * b5;
    const t4 = a1 * b3 + a4 * b4 + a7 * b5;
    const t5 = a2 * b3 + a5 * b4 + a8 * b5;
    const t6 = a0 * b6 + a3 * b7 + a6 * b8;
    const t7 = a1 * b6 + a4 * b7 + a7 * b8;
    const t8 = a2 * b6 + a5 * b7 + a8 * b8;
    target[0] = t0;
    target[1] = t1;
    target[2] = t2;
    target[3] = t3;
    target[4] = t4;
    target[5] = t5;
    target[6] = t6;
    target[7] = t7;
    target[8] = t8;
  }

  /**
   * Calculates the determinant of a matrix using JS. (SÍNCRONO)
   */
  // --- CAMBIO: Síncrono, usa implementación JS directa ---
  static determinant(m: Matrix3x3): number {
    if (!(m instanceof Float32Array && m.length === 9)) {
      throw new MatrixError(
        "Invalid matrix provided to determinant()",
        "INVALID_MATRIX"
      );
    }
    // Usar lógica JS directamente
    const a = m[0],
      b = m[1],
      c = m[2],
      d = m[3],
      e = m[4],
      f = m[5],
      g = m[6],
      h = m[7],
      i = m[8];
    return a * (e * i - h * f) - d * (b * i - h * c) + g * (b * f - e * c);
  }

  // Eliminar o mantener privado el helper determinantJS si no se usa más
  // private static determinantJS(m: Matrix3x3): number { ... }

  /**
   * Calculates the inverse of a matrix using JS. (SÍNCRONO)
   * Returns the inverted matrix or null if singular.
   */
  // --- CAMBIO: Síncrono, usa implementación JS, devuelve null ---
  static inverse(m: Matrix3x3): Matrix3x3 | null {
    if (!(m instanceof Float32Array && m.length === 9)) {
      throw new MatrixError(
        "Invalid matrix provided to inverse()",
        "INVALID_MATRIX"
      );
    }

    // Implementación directa JS (corregida)
    const M = m;
    const det = this.determinant(M); // Llama a la versión JS síncrona

    if (Math.abs(det) < this.epsilon) {
      return null; // Es singular, devuelve null
    }

    const invDet = 1.0 / det;
    const out = new Float32Array(9) as Matrix3x3;

    const m0 = M[0],
      m1 = M[1],
      m2 = M[2],
      m3 = M[3],
      m4 = M[4],
      m5 = M[5],
      m6 = M[6],
      m7 = M[7],
      m8 = M[8];
    out[0] = (m4 * m8 - m7 * m5) * invDet;
    out[1] = (m7 * m2 - m1 * m8) * invDet;
    out[2] = (m1 * m5 - m4 * m2) * invDet;
    out[3] = (m5 * m6 - m3 * m8) * invDet;
    out[4] = (m0 * m8 - m6 * m2) * invDet;
    out[5] = (m2 * m3 - m0 * m5) * invDet;
    out[6] = (m3 * m7 - m6 * m4) * invDet;
    out[7] = (m6 * m1 - m0 * m7) * invDet;
    out[8] = (m0 * m4 - m3 * m1) * invDet;

    // Opcional: Chequear si out contiene NaN/Infinity por problemas numéricos extremos
    if (out.some((v) => !isValidNumber(v))) {
      console.warn(
        "MatrixUtils.inverse: Result contains NaN/Infinity despite non-zero determinant."
      );
      return null; // O lanzar un error diferente
    }

    return out;
  }

  /**
   * Transforms a 2D point using a 3x3 matrix (JS Implementation). (Síncrono - Sin Cambios)
   */
  static transformPoint(m: Matrix3x3, p: Point, out?: Point): Point {
    // ... (sin cambios - ya era JS síncrono) ...
    if (!(m instanceof Float32Array && m.length === 9))
      throw new MatrixError(
        "Invalid matrix for transformPoint",
        "INVALID_MATRIX"
      );
    if (!isValidPoint(p))
      throw new MatrixError(
        "Invalid point for transformPoint",
        "INVALID_POINT"
      );
    const { x, y } = p;
    const m0 = m[0],
      m1 = m[1],
      m2 = m[2],
      m3 = m[3],
      m4 = m[4],
      m5 = m[5],
      m6 = m[6],
      m7 = m[7],
      m8 = m[8];
    const X = m0 * x + m3 * y + m6;
    const Y = m1 * x + m4 * y + m7;
    const W = m2 * x + m5 * y + m8;
    let outX: number, outY: number;
    if (Math.abs(W) < MatrixUtils.epsilon) {
      if (process.env.NODE_ENV !== "production")
        console.warn(
          `transformPoint: Perspective division by near-zero W (${W.toExponential()}).`
        );
      outX = NaN;
      outY = NaN;
    } else {
      outX = X / W;
      outY = Y / W;
    }
    const dst = out ?? { x: 0, y: 0 };
    dst.x = outX;
    dst.y = outY;
    return dst;
  }

  /**
   * Calculates the AABB of a transformed rectangle using JS. (Síncrono - Sin Cambios)
   */
  static transformRect(m: Matrix3x3, r: Rect, out?: Rect): Rect {
    // ... (sin cambios - ya era JS síncrono) ...
    if (!(m instanceof Float32Array && m.length === 9))
      throw new MatrixError(
        "Invalid matrix for transformRect",
        "INVALID_MATRIX"
      );
    if (!isValidRect(r))
      throw new MatrixError(
        `Invalid rectangle for transformRect`,
        "INVALID_RECT"
      );
    const p1_in = { x: r.x, y: r.y },
      p2_in = { x: r.x + r.width, y: r.y },
      p3_in = { x: r.x + r.width, y: r.y + r.height },
      p4_in = { x: r.x, y: r.y + r.height };
    const p1_out = this.transformPoint(m, p1_in),
      p2_out = this.transformPoint(m, p2_in),
      p3_out = this.transformPoint(m, p3_in),
      p4_out = this.transformPoint(m, p4_in);
    const xs = [p1_out.x, p2_out.x, p3_out.x, p4_out.x].filter(isValidNumber);
    const ys = [p1_out.y, p2_out.y, p3_out.y, p4_out.y].filter(isValidNumber);
    const minX = xs.length > 0 ? Math.min(...xs) : NaN;
    const minY = ys.length > 0 ? Math.min(...ys) : NaN;
    const maxX = xs.length > 0 ? Math.max(...xs) : NaN;
    const maxY = ys.length > 0 ? Math.max(...ys) : NaN;
    const dst = out ?? { x: 0, y: 0, width: 0, height: 0 };
    dst.x = minX;
    dst.y = minY;
    dst.width = isValidNumber(maxX) && isValidNumber(minX) ? maxX - minX : NaN;
    dst.height = isValidNumber(maxY) && isValidNumber(minY) ? maxY - minY : NaN;
    return dst;
  }

  /**
   * Transforms a batch of points using WASM. (ASÍNCRONO - Sin Cambios)
   */
  static async transformPointsBatch(
    matrix: Matrix3x3,
    pointsIn: Float32Array
  ): Promise<Float32Array> {
    // ... (sin cambios - sigue usando WASM async) ...
    if (!(matrix instanceof Float32Array && matrix.length === 9))
      throw new MatrixError(
        "Invalid matrix for transformPointsBatch",
        "INVALID_MATRIX"
      );
    return transformPointsBatchWasm_Copy(matrix, pointsIn);
  }

  // --- Métodos básicos de creación (SÍNCRONOS - Sin Cambios) ---
  static translation(dx: number, dy: number): Matrix3x3 {
    /*...*/ const m = this.identity();
    this.translationInPlace(m, dx, dy);
    return m;
  }
  static translationInPlace(target: Matrix3x3, dx: number, dy: number): void {
    /*...*/ if (!(target instanceof Float32Array && target.length === 9))
      throw new MatrixError(
        "Invalid target for translationInPlace",
        "INVALID_MATRIX"
      );
    if (!isValidNumber(dx)) dx = 0;
    if (!isValidNumber(dy)) dy = 0;
    target.set([1, 0, 0, 0, 1, 0, dx, dy, 1]);
  }
  static rotation(angle: number): Matrix3x3 {
    /*...*/ const m = this.identity();
    this.rotationInPlace(m, angle);
    return m;
  }
  static rotationInPlace(target: Matrix3x3, angle: number): void {
    /*...*/ if (!(target instanceof Float32Array && target.length === 9))
      throw new MatrixError(
        "Invalid target for rotationInPlace",
        "INVALID_MATRIX"
      );
    if (!isValidNumber(angle)) angle = 0;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    target.set([c, s, 0, -s, c, 0, 0, 0, 1]);
  }
  static rotationAround(angle: number, center: Point): Matrix3x3 {
    /*...*/ if (!isValidPoint(center))
      throw new MatrixError(
        `Invalid center for rotationAround`,
        "INVALID_POINT"
      );
    if (!isValidNumber(angle)) angle = 0;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const { x, y } = center;
    const tx = x - x * c + y * s;
    const ty = y - x * s - y * c;
    const m = new Float32Array([c, s, 0, -s, c, 0, tx, ty, 1]) as Matrix3x3;
    return m;
  }
  static scaling(sx: number, sy: number): Matrix3x3 {
    /*...*/ const m = this.identity();
    this.scalingInPlace(m, sx, sy);
    return m;
  }
  static scalingInPlace(target: Matrix3x3, sx: number, sy: number): void {
    /*...*/ if (!(target instanceof Float32Array && target.length === 9))
      throw new MatrixError(
        "Invalid target for scalingInPlace",
        "INVALID_MATRIX"
      );
    if (!isValidNumber(sx)) sx = 1;
    if (!isValidNumber(sy)) sy = 1;
    if (Math.abs(sx) < this.epsilon || Math.abs(sy) < this.epsilon) {
      if (process.env.NODE_ENV !== "production")
        console.warn(`scalingInPlace: Near-zero scale factor (${sx}, ${sy}).`);
    }
    target.set([sx, 0, 0, 0, sy, 0, 0, 0, 1]);
  }
  static scalingAround(sx: number, sy: number, center: Point): Matrix3x3 {
    /*...*/ if (!isValidPoint(center))
      throw new MatrixError(
        `Invalid center for scalingAround`,
        "INVALID_POINT"
      );
    if (!isValidNumber(sx)) sx = 1;
    if (!isValidNumber(sy)) sy = 1;
    const { x, y } = center;
    const tx = x * (1 - sx);
    const ty = y * (1 - sy);
    const m = new Float32Array([sx, 0, 0, 0, sy, 0, tx, ty, 1]) as Matrix3x3;
    return m;
  }
  static fromValues(
    v0: number,
    v1: number,
    v2: number,
    v3: number,
    v4: number,
    v5: number,
    v6: number,
    v7: number,
    v8: number
  ): Matrix3x3 {
    const vs = [v0, v1, v2, v3, v4, v5, v6, v7, v8];
    if (vs.some((v) => !isValidNumber(v)))
      throw new MatrixError(
        "Invalid values provided to fromValues",
        "INVALID_MATRIX"
      );
    const o = new Float32Array(9) as Matrix3x3;
    o.set(vs);
    return o;
  }

  // --- In-Place Accumulative Operations (AHORA SÍNCRONAS) ---

  // --- CAMBIO: Quitar async/await, usar multiply síncrono ---
  static applyTranslationInPlace(
    target: Matrix3x3,
    dx: number,
    dy: number
  ): void {
    const validDx = isValidNumber(dx) ? dx : 0;
    const validDy = isValidNumber(dy) ? dy : 0;

    if (validDx === 0 && validDy === 0) {
      return;
    }

    const t = this.translation(validDx, validDy);

    this.multiplyInPlace(t, this.clone(target), target);
  }

  static applyRotationInPlace(target: Matrix3x3, angle: number): void {
    if (!isValidNumber(angle)) angle = 0;
    const r = this.rotation(angle);
    this.multiplyInPlace(r, this.clone(target), target);
  }

  static applyScalingInPlace(target: Matrix3x3, sx: number, sy: number): void {
    if (!isValidNumber(sx)) sx = 1;
    if (!isValidNumber(sy)) sy = 1;
    const s = this.scaling(sx, sy);
    this.multiplyInPlace(s, this.clone(target), target);
  }

  static applyRotationAroundInPlace(
    target: Matrix3x3,
    angle: number,
    center: Point
  ): void {
    if (!isValidPoint(center)) {
      console.warn(`applyRotationAroundInPlace: Invalid center.`);
      return;
    }
    if (!isValidNumber(angle)) angle = 0;
    const r = this.rotationAround(angle, center);
    this.multiplyInPlace(r, this.clone(target), target);
  }

  static applyScalingAroundInPlace(
    target: Matrix3x3,
    sx: number,
    sy: number,
    center: Point
  ): void {
    if (!isValidPoint(center)) {
      console.warn(`applyScalingAroundInPlace: Invalid center.`);
      return;
    }
    if (!isValidNumber(sx)) sx = 1;
    if (!isValidNumber(sy)) sy = 1;
    const s = this.scalingAround(sx, sy, center);
    this.multiplyInPlace(s, this.clone(target), target);
  }

  static applySkewInPlace(
    target: Matrix3x3,
    skewX: number,
    skewY: number
  ): void {
    if (!isValidNumber(skewX)) skewX = 0;
    if (!isValidNumber(skewY)) skewY = 0;
    const tx = Math.tan(skewX);
    const ty = Math.tan(skewY);

    // Renombrar la variable
    const skewMatrix = this.fromValues(1, ty, 0, tx, 1, 0, 0, 0, 1);

    this.multiplyInPlace(skewMatrix, this.clone(target), target);
  }

  static applyMatrixInPlace(target: Matrix3x3, m: Matrix3x3): void {
    if (!(m instanceof Float32Array && m.length === 9)) {
      console.warn(`applyMatrixInPlace: Invalid input matrix 'm'.`);
      return;
    }
    // Usar la m de entrada como 'a' en multiplyInPlace(a, b, target)
    this.multiplyInPlace(m, this.clone(target), target);
  }
}
