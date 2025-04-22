import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatrixUtils } from "../matrix/MatrixUtils";
import type { Matrix3x3 } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { expectMatrixCloseTo } from "./matrix-test-helpers";

describe("MatrixUtils - Core Operations (No Pooling)", () => {
  let identity: Matrix3x3;

  beforeEach(() => {
    vi.restoreAllMocks();
    identity = MatrixUtils.identity();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Basic Matrix Creation and Cloning ---
  it("identity() should return a new identity matrix", () => {
    const m = MatrixUtils.identity();
    expectMatrixCloseTo(m, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("clone() should create a new identical copy", () => {
    const matrix1 = MatrixUtils.translation(10, 20); // Usa creation method como setup
    const expected = [1, 0, 0, 0, 1, 0, 10, 20, 1];
    const clone = MatrixUtils.clone(matrix1);
    expect(clone).not.toBe(matrix1);
    expectMatrixCloseTo(clone, expected);
  });

  it("clone() should throw MatrixError for invalid input", () => {
    expect(() => MatrixUtils.clone(null as any)).toThrow(MatrixError);
    expect(() => MatrixUtils.clone(new Float32Array(8) as any)).toThrow(
      MatrixError
    );
    expect(() => MatrixUtils.clone([1, 2, 3, 4, 5, 6, 7, 8, 9] as any)).toThrow(
      MatrixError
    );
  });

  it("identityInPlace() should modify the matrix to identity", () => {
    const matrix1 = MatrixUtils.translation(10, 20); // Usa creation method como setup
    MatrixUtils.identityInPlace(matrix1);
    expectMatrixCloseTo(matrix1, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("identityInPlace() should throw MatrixError for invalid target", () => {
    expect(() => MatrixUtils.identityInPlace(null as any)).toThrow(MatrixError);
    expect(() =>
      MatrixUtils.identityInPlace(new Float32Array(8) as any)
    ).toThrow(MatrixError);
    expect(() => MatrixUtils.identityInPlace([1, 0, 0] as any)).toThrow(
      MatrixError
    );
    expect(() => MatrixUtils.identityInPlace({} as any)).toThrow(MatrixError);
  });

  // --- Matrix Operations (Multiply, Inverse, Determinant) ---
  it("multiply() should correctly multiply two affine matrices", () => {
    const matrix1 = MatrixUtils.translation(10, 5);
    const matrix2 = MatrixUtils.scaling(2, 3);
    const expected = [2, 0, 0, 0, 3, 0, 20, 15, 1]; // S * T
    const result = MatrixUtils.multiply(matrix2, matrix1);
    expectMatrixCloseTo(result, expected);
  });

  it("multiply() should handle non-affine matrices", () => {
    const matrix1 = new Float32Array([
      1, 4, 0.1, 2, 5, 0.2, 3, 6, 1,
    ]) as Matrix3x3;
    const matrix2 = new Float32Array([2, 0, 0, 0, 3, 0, 10, 5, 1]) as Matrix3x3;
    const expected = [3, 12.5, 0.1, 6, 16, 0.2, 16, 23, 1]; // M2 * M1
    const result = MatrixUtils.multiply(matrix2, matrix1);
    expectMatrixCloseTo(result, expected);
  });

  it("multiply() should throw MatrixError for invalid inputs", () => {
    const validMatrix = MatrixUtils.identity();
    expect(() => MatrixUtils.multiply(null as any, validMatrix)).toThrow(
      MatrixError
    );
    expect(() => MatrixUtils.multiply(validMatrix, null as any)).toThrow(
      MatrixError
    );
    expect(() =>
      MatrixUtils.multiply(new Float32Array(8) as any, validMatrix)
    ).toThrow(MatrixError);
    expect(() => MatrixUtils.multiply(validMatrix, [1] as any)).toThrow(
      MatrixError
    );
  });

  it("multiplyInPlace() should correctly modify the target matrix", () => {
    const matrix1 = MatrixUtils.translation(5, 1);
    const matrix2 = MatrixUtils.rotation(Math.PI / 2);
    const target = MatrixUtils.identity();
    const expected = [0, 1, 0, -1, 0, 0, -1, 5, 1]; // R(90) * T(5,1)
    MatrixUtils.multiplyInPlace(matrix2, matrix1, target);
    expectMatrixCloseTo(target, expected);
  });

  it("multiplyInPlace() should throw MatrixError for invalid inputs", () => {
    const valid = MatrixUtils.identity();
    const invalid = new Float32Array(8) as any;
    const target = MatrixUtils.identity();
    expect(() => MatrixUtils.multiplyInPlace(invalid, valid, target)).toThrow(
      /Invalid left matrix/
    );
    expect(() => MatrixUtils.multiplyInPlace(valid, invalid, target)).toThrow(
      /Invalid right matrix/
    );
    expect(() => MatrixUtils.multiplyInPlace(valid, valid, invalid)).toThrow(
      /Invalid target matrix/
    );
    // Null cases
    expect(() =>
      MatrixUtils.multiplyInPlace(null as any, valid, target)
    ).toThrow(/Invalid left matrix/);
    expect(() =>
      MatrixUtils.multiplyInPlace(valid, null as any, target)
    ).toThrow(/Invalid right matrix/);
    expect(() =>
      MatrixUtils.multiplyInPlace(valid, valid, null as any)
    ).toThrow(/Invalid target matrix/);
  });

  it("determinant() should calculate determinant for affine and non-affine matrices", () => {
    const affineMatrix = MatrixUtils.scaling(2, 3);
    expect(MatrixUtils.determinant(affineMatrix)).toBeCloseTo(6);
    const nonAffineMatrix = new Float32Array([
      1, 2, 3, 0, 1, 4, 5, 6, 1,
    ]) as Matrix3x3;
    expect(MatrixUtils.determinant(nonAffineMatrix)).toBeCloseTo(2);
  });

  it("determinant() should throw MatrixError for invalid matrix input", () => {
    expect(() => MatrixUtils.determinant(null as any)).toThrow(
      /Invalid matrix/
    );
    expect(() => MatrixUtils.determinant(new Float32Array(5) as any)).toThrow(
      /Invalid matrix/
    );
    expect(() => MatrixUtils.determinant([1] as any)).toThrow(/Invalid matrix/);
    expect(() => MatrixUtils.determinant({} as any)).toThrow(/Invalid matrix/);
  });

  it("inverse() should return the inverse of an affine matrix", () => {
    const matrix1 = MatrixUtils.translation(10, 20);
    const expectedInv = [1, 0, 0, 0, 1, 0, -10, -20, 1];
    expectMatrixCloseTo(MatrixUtils.inverse(matrix1), expectedInv);

    const angle = Math.PI / 4;
    const matrix2 = MatrixUtils.rotation(angle);
    const expectedRotInv = MatrixUtils.rotation(-angle);
    expectMatrixCloseTo(MatrixUtils.inverse(matrix2), expectedRotInv);
  });

  it("inverse() should calculate inverse for non-affine matrices", () => {
    const matrix1 = new Float32Array([1, 0, 0, 2, 1, 0, 5, 6, 1]) as Matrix3x3; // Det=1
    const inverseMatrix = MatrixUtils.inverse(matrix1);
    expect(inverseMatrix).not.toBeNull();
    const identityCheck = MatrixUtils.multiply(matrix1, inverseMatrix!);
    expectMatrixCloseTo(identityCheck, MatrixUtils.identity(), 1e-6);
  });

  it("inverse() should return null for singular matrices", () => {
    const matrix1 = MatrixUtils.scaling(1, 0); // Det=0
    expect(MatrixUtils.inverse(matrix1)).toBeNull();
    const matrix2 = new Float32Array([1, 2, 0, 2, 4, 0, 3, 6, 1]) as Matrix3x3; // Det=0
    expect(MatrixUtils.inverse(matrix2)).toBeNull();
  });

  it("inverse() should throw MatrixError for invalid matrix type", () => {
    expect(() => MatrixUtils.inverse(new Float32Array(8) as any)).toThrow(
      /Invalid matrix/
    );
    expect(() => MatrixUtils.inverse([1] as any)).toThrow(/Invalid matrix/);
    expect(() => MatrixUtils.inverse(null as any)).toThrow(/Invalid matrix/);
  });

  it("multiplyInPlace should correctly multiply and store result in 'out'", () => {
    const t = MatrixUtils.translation(10, 5);
    const s = MatrixUtils.scaling(2, 3);
    const result = MatrixUtils.identity();
    const expected = MatrixUtils.multiply(s, t);

    MatrixUtils.multiplyInPlace(s, t, result);

    expectMatrixCloseTo(result, expected);
  });

  it("multiplyInPlace should work when 'out' is one of the inputs", () => {
    const t = MatrixUtils.translation(10, 5);
    const s = MatrixUtils.scaling(2, 3);
    const originalT = MatrixUtils.clone(t);
    const expected = MatrixUtils.multiply(s, originalT);

    MatrixUtils.multiplyInPlace(s, t, t); // Modifica t

    expectMatrixCloseTo(t, expected);
  });

  it("multiplyInPlace using identity", () => {
    const t = MatrixUtils.translation(10, 5);
    const originalT = MatrixUtils.clone(t);
    const result = MatrixUtils.identity();

    MatrixUtils.multiplyInPlace(identity, t, result); // I * T -> result
    expectMatrixCloseTo(result, originalT);

    MatrixUtils.multiplyInPlace(t, identity, result); // T * I -> result
    expectMatrixCloseTo(result, originalT);
  });
});
