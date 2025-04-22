import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatrixUtils } from "../matrix/MatrixUtils";
import type { Point } from "../../types/core.types";
import { expectMatrixCloseTo } from "./matrix-test-helpers";

describe("MatrixUtils - Apply In-Place Methods (No Pooling)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- In-Place Apply Methods ---
  it("applyTranslationInPlace() should apply translation correctly", () => {
    const matrix1 = MatrixUtils.scaling(2, 2); // S(2,2)
    const originalMatrix = MatrixUtils.clone(matrix1);
    const dx = 10,
      dy = -5;
    const expectedResult = MatrixUtils.multiply(
      MatrixUtils.translation(dx, dy),
      originalMatrix
    ); // T * S
    MatrixUtils.applyTranslationInPlace(matrix1, dx, dy); // matrix1 = T * S
    expectMatrixCloseTo(matrix1, expectedResult);
  });

  it("applyTranslationInPlace() should default invalid dx/dy to 0 and not modify", () => {
    const matrix1 = MatrixUtils.identity();
    const originalMatrix = MatrixUtils.clone(matrix1);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); // Should not warn here

    MatrixUtils.applyTranslationInPlace(matrix1, NaN, 5); // Apply T(0,5)
    expectMatrixCloseTo(matrix1, MatrixUtils.translation(0, 5));
    expect(warnSpy).not.toHaveBeenCalled();

    MatrixUtils.identityInPlace(matrix1); // Reset
    MatrixUtils.applyTranslationInPlace(matrix1, 5, NaN); // Apply T(5,0)
    expectMatrixCloseTo(matrix1, MatrixUtils.translation(5, 0));
    expect(warnSpy).not.toHaveBeenCalled();

    MatrixUtils.identityInPlace(matrix1); // Reset
    MatrixUtils.applyTranslationInPlace(matrix1, NaN, NaN); // Apply T(0,0) -> No change from I
    expectMatrixCloseTo(matrix1, MatrixUtils.identity());
    expect(warnSpy).not.toHaveBeenCalled();

    // Test case where invalid input should prevent modification entirely
    const nonIdentityStart = MatrixUtils.scaling(2, 2);
    const nonIdentityOriginal = MatrixUtils.clone(nonIdentityStart);
    MatrixUtils.applyTranslationInPlace(nonIdentityStart, NaN, NaN); // Should apply T(0,0) which is Identity * current
    expectMatrixCloseTo(nonIdentityStart, nonIdentityOriginal); // Check it didn't reset to Identity

    warnSpy.mockRestore();
  });

  it("applyRotationInPlace() should apply rotation correctly", () => {
    const matrix1 = MatrixUtils.translation(10, 10); // T(10,10)
    const originalMatrix = MatrixUtils.clone(matrix1);
    const angle = Math.PI / 4;
    const expectedResult = MatrixUtils.multiply(
      MatrixUtils.rotation(angle),
      originalMatrix
    ); // R * T
    MatrixUtils.applyRotationInPlace(matrix1, angle); // matrix1 = R * T
    expectMatrixCloseTo(matrix1, expectedResult, 1e-5);
  });

  it("applyRotationInPlace() should handle invalid angle by setting it to 0 (no change)", () => {
    const target = MatrixUtils.translation(5, 5); // Start non-identity
    const original = MatrixUtils.clone(target);
    MatrixUtils.applyRotationInPlace(target, NaN); // Apply R(0) = I
    expectMatrixCloseTo(target, original); // Should remain unchanged
    MatrixUtils.applyRotationInPlace(target, Infinity); // Apply R(0) = I
    expectMatrixCloseTo(target, original); // Should remain unchanged
  });

  it("applyScalingInPlace() should apply scaling correctly", () => {
    const matrix1 = MatrixUtils.rotation(Math.PI / 6); // R(pi/6)
    const originalMatrix = MatrixUtils.clone(matrix1);
    const sx = 3,
      sy = 0.5;
    const expectedResult = MatrixUtils.multiply(
      MatrixUtils.scaling(sx, sy),
      originalMatrix
    ); // S * R
    MatrixUtils.applyScalingInPlace(matrix1, sx, sy); // matrix1 = S * R
    expectMatrixCloseTo(matrix1, expectedResult);
  });

  it("applyScalingInPlace() should handle invalid sx and sy by setting them to 1", () => {
    const target = MatrixUtils.rotation(Math.PI / 4); // Start non-identity
    const original = MatrixUtils.clone(target);
    const expected1 = MatrixUtils.multiply(MatrixUtils.scaling(1, 5), original); // S(1, 5) * R
    MatrixUtils.applyScalingInPlace(target, NaN, 5);
    expectMatrixCloseTo(target, expected1);

    const expected2 = MatrixUtils.multiply(
      MatrixUtils.scaling(10, 1),
      expected1
    ); // S(10, 1) * S(1, 5) * R
    MatrixUtils.applyScalingInPlace(target, 10, Infinity);
    expectMatrixCloseTo(target, expected2);

    // S(1,1) = Identity, applying it should not change the matrix
    MatrixUtils.applyScalingInPlace(target, NaN, NaN);
    expectMatrixCloseTo(target, expected2); // Should still be expected2
  });

  it("applyScalingInPlace() should warn via scalingInPlace on near-zero factors", () => {
    const matrix1 = MatrixUtils.identity();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tinyScale = MatrixUtils.getEpsilon() / 2;
    MatrixUtils.applyScalingInPlace(matrix1, tinyScale, 1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Near-zero scale factor")
    );
    warnSpy.mockRestore();
  });

  it("applyRotationAroundInPlace() should apply rotation around a center correctly", () => {
    const matrix1 = MatrixUtils.scaling(2, 1); // S(2,1)
    const originalMatrix = MatrixUtils.clone(matrix1);
    const angle = -Math.PI / 2;
    const point1: Point = { x: 5, y: 8 };
    const rotationAroundMatrix = MatrixUtils.rotationAround(angle, point1);
    const expectedResult = MatrixUtils.multiply(
      rotationAroundMatrix,
      originalMatrix
    ); // Ra * S
    MatrixUtils.applyRotationAroundInPlace(matrix1, angle, point1); // matrix1 = Ra * S
    expectMatrixCloseTo(matrix1, expectedResult, 1e-5);
  });

  it("applyRotationAroundInPlace() should warn and not modify for invalid center", () => {
    const target = MatrixUtils.identity();
    const originalValues = [...target];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    MatrixUtils.applyRotationAroundInPlace(target, 1, {
      x: 1,
      y: NaN,
    } as Point);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid center")
    );
    expect(Array.from(target)).toEqual(originalValues); // No change
    warnSpy.mockClear();
    MatrixUtils.applyRotationAroundInPlace(target, 1, null as any);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid center")
    );
    expect(Array.from(target)).toEqual(originalValues); // No change
    warnSpy.mockRestore();
  });

  it("applyRotationAroundInPlace() should handle invalid angle by setting it to 0 (no change)", () => {
    const target = MatrixUtils.scaling(2, 2); // Start non-identity
    const original = MatrixUtils.clone(target);
    const center: Point = { x: 1, y: 1 };
    MatrixUtils.applyRotationAroundInPlace(target, NaN, center); // Apply Ra(0, C) = I
    expectMatrixCloseTo(target, original); // Should not change
    MatrixUtils.applyRotationAroundInPlace(target, Infinity, center); // Apply Ra(0, C) = I
    expectMatrixCloseTo(target, original); // Should not change
  });

  it("applyScalingAroundInPlace() should apply scaling around a center correctly", () => {
    const matrix1 = MatrixUtils.translation(100, 0); // T(100, 0)
    const originalMatrix = MatrixUtils.clone(matrix1);
    const sx = 1.5,
      sy = 2.5;
    const point1: Point = { x: 10, y: -10 };
    const scalingAroundMatrix = MatrixUtils.scalingAround(sx, sy, point1);
    const expectedResult = MatrixUtils.multiply(
      scalingAroundMatrix,
      originalMatrix
    ); // Sa * T
    MatrixUtils.applyScalingAroundInPlace(matrix1, sx, sy, point1); // matrix1 = Sa * T
    expectMatrixCloseTo(matrix1, expectedResult);
  });

  it("applyScalingAroundInPlace() should warn and not modify for invalid center", () => {
    const target = MatrixUtils.identity();
    const originalValues = [...target];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    MatrixUtils.applyScalingAroundInPlace(target, 2, 2, {
      x: NaN,
      y: 1,
    } as Point);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid center")
    );
    expect(Array.from(target)).toEqual(originalValues); // No change
    warnSpy.mockClear();
    MatrixUtils.applyScalingAroundInPlace(target, 2, 2, null as any);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid center")
    );
    expect(Array.from(target)).toEqual(originalValues); // No change
    warnSpy.mockRestore();
  });

  it("applyScalingAroundInPlace() should handle invalid sx/sy by setting them to 1", () => {
    const target = MatrixUtils.translation(1, 1); // Start non-identity T(1,1)
    const original = MatrixUtils.clone(target);
    const center: Point = { x: 10, y: 20 };
    const expected1 = MatrixUtils.multiply(
      MatrixUtils.scalingAround(1, 5, center),
      original
    ); // Sa(1, 5, C) * T(1,1)
    MatrixUtils.applyScalingAroundInPlace(target, NaN, 5, center);
    expectMatrixCloseTo(target, expected1);

    const expected2 = MatrixUtils.multiply(
      MatrixUtils.scalingAround(10, 1, center),
      expected1
    ); // Sa(10, 1, C) * Prev
    MatrixUtils.applyScalingAroundInPlace(target, 10, Infinity, center);
    expectMatrixCloseTo(target, expected2);

    // Applying Sa(1, 1, C) = Identity should not change the result
    MatrixUtils.applyScalingAroundInPlace(target, NaN, NaN, center);
    expectMatrixCloseTo(target, expected2);
  });

  it("applySkewInPlace() should apply skew correctly", () => {
    const matrix1 = MatrixUtils.translation(20, 30); // T(20, 30)
    const originalMatrix = MatrixUtils.clone(matrix1);
    const skewX = 0.5,
      skewY = -0.2;
    const tx = Math.tan(skewX),
      ty = Math.tan(skewY);
    const skewMatrix = MatrixUtils.fromValues(1, ty, 0, tx, 1, 0, 0, 0, 1);
    const expectedResult = MatrixUtils.multiply(skewMatrix, originalMatrix); // Sk * T
    MatrixUtils.applySkewInPlace(matrix1, skewX, skewY); // matrix1 = Sk * T
    expectMatrixCloseTo(matrix1, expectedResult, 1e-5);
  });

  it("applySkewInPlace() should handle invalid skewX/skewY by setting them to 0", () => {
    const target = MatrixUtils.translation(1, 1); // Start non-identity T(1,1)
    const original = MatrixUtils.clone(target);
    const expected1 = MatrixUtils.multiply(
      MatrixUtils.fromValues(1, Math.tan(0.1), 0, 0, 1, 0, 0, 0, 1),
      original
    ); // Sk(0, 0.1) * T
    MatrixUtils.applySkewInPlace(target, NaN, 0.1);
    expectMatrixCloseTo(target, expected1, 1e-6);

    const expected2 = MatrixUtils.multiply(
      MatrixUtils.fromValues(1, 0, 0, Math.tan(0.2), 1, 0, 0, 0, 1),
      expected1
    ); // Sk(0.2, 0) * Prev
    MatrixUtils.applySkewInPlace(target, 0.2, Infinity);
    expectMatrixCloseTo(target, expected2, 1e-6);

    // Applying Sk(0,0) = Identity should not change the result
    MatrixUtils.applySkewInPlace(target, NaN, NaN);
    expectMatrixCloseTo(target, expected2, 1e-6);
  });

  it("applyMatrixInPlace() should apply matrix multiplication correctly", () => {
    const matrix1 = MatrixUtils.scaling(3, 3); // S(3,3)
    const originalMatrix = MatrixUtils.clone(matrix1);
    const matrix2 = MatrixUtils.rotation(Math.PI / 3); // R(pi/3)
    const expectedResult = MatrixUtils.multiply(matrix2, originalMatrix); // R * S
    MatrixUtils.applyMatrixInPlace(matrix1, matrix2); // matrix1 = R * S
    expectMatrixCloseTo(matrix1, expectedResult, 1e-5);
  });

  it("applyMatrixInPlace() should warn on invalid matrix and not modify target", () => {
    const matrix1 = MatrixUtils.identity();
    const original = [...matrix1];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    MatrixUtils.applyMatrixInPlace(matrix1, null as any);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid input matrix")
    );
    expect(Array.from(matrix1)).toEqual(original); // No change
    warnSpy.mockRestore();
  });
});
