import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatrixUtils } from "../matrix/MatrixUtils";
import type { Point } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { expectMatrixCloseTo } from "./matrix-test-helpers";

describe("MatrixUtils - Creation Methods (No Pooling)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Specific Matrix Creation Methods ---
  it("translation() should create a correct translation matrix", () => {
    const m = MatrixUtils.translation(5, -3);
    expectMatrixCloseTo(m, [1, 0, 0, 0, 1, 0, 5, -3, 1]);
  });
  it("translationInPlace() should set translation correctly", () => {
    const m = MatrixUtils.identity();
    MatrixUtils.translationInPlace(m, 5, -3);
    expectMatrixCloseTo(m, [1, 0, 0, 0, 1, 0, 5, -3, 1]);
  });
  it("translationInPlace() should throw MatrixError for invalid target", () => {
    expect(() => MatrixUtils.translationInPlace(null as any, 1, 1)).toThrow(
      MatrixError
    );
  });
  it("translationInPlace() should handle invalid dx and dy by setting them to 0", () => {
    const target = MatrixUtils.identity();
    MatrixUtils.translationInPlace(target, NaN, 5);
    expectMatrixCloseTo(target, [1, 0, 0, 0, 1, 0, 0, 5, 1]); // T(0, 5)
    MatrixUtils.identityInPlace(target);
    MatrixUtils.translationInPlace(target, 10, Infinity);
    expectMatrixCloseTo(target, [1, 0, 0, 0, 1, 0, 10, 0, 1]); // T(10, 0)
    MatrixUtils.identityInPlace(target);
    MatrixUtils.translationInPlace(target, NaN, Infinity);
    expectMatrixCloseTo(target, [1, 0, 0, 0, 1, 0, 0, 0, 1]); // T(0, 0) = I
  });

  it("rotation() should create a correct rotation matrix", () => {
    const angle = Math.PI / 6;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const m = MatrixUtils.rotation(angle);
    expectMatrixCloseTo(m, [c, s, 0, -s, c, 0, 0, 0, 1]);
  });
  it("rotationInPlace() should set rotation correctly", () => {
    const angle = Math.PI / 6;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const m = MatrixUtils.identity();
    MatrixUtils.rotationInPlace(m, angle);
    expectMatrixCloseTo(m, [c, s, 0, -s, c, 0, 0, 0, 1]);
  });
  it("rotationInPlace() should throw MatrixError for invalid target", () => {
    expect(() => MatrixUtils.rotationInPlace(null as any, 1)).toThrow(
      MatrixError
    );
  });
  it("rotationInPlace() should handle invalid angle by setting it to 0", () => {
    const target = MatrixUtils.identity();
    MatrixUtils.rotationInPlace(target, NaN);
    expectMatrixCloseTo(target, [1, 0, 0, 0, 1, 0, 0, 0, 1]); // R(0) = I
    MatrixUtils.translationInPlace(target, 5, 5); // Change target
    MatrixUtils.rotationInPlace(target, Infinity);
    expectMatrixCloseTo(target, [1, 0, 0, 0, 1, 0, 0, 0, 1]); // R(0) = I
  });

  it("rotationAround() should create a correct rotation matrix around a center", () => {
    const angle = Math.PI / 2; // 90 deg
    const center: Point = { x: 10, y: 20 };
    const m = MatrixUtils.rotationAround(angle, center);
    // T(c) * R(a) * T(-c) -> Col-Major: [0, 1, 0, -1, 0, 0, 30, 10, 1]
    expectMatrixCloseTo(m, [0, 1, 0, -1, 0, 0, 30, 10, 1]);
  });
  it("rotationAround() should throw MatrixError for invalid center point", () => {
    expect(() => MatrixUtils.rotationAround(1, null as any)).toThrow(
      /Invalid center/
    );
    expect(() =>
      MatrixUtils.rotationAround(1, { x: 1, y: NaN } as Point)
    ).toThrow(/Invalid center/);
  });
  it("rotationAround() should handle invalid angle by setting it to 0 (resulting in Identity)", () => {
    const center = { x: 10, y: 20 };
    const resultNaN = MatrixUtils.rotationAround(NaN, center);
    expectMatrixCloseTo(resultNaN, MatrixUtils.identity()); // R(0) around C = I
    const resultInf = MatrixUtils.rotationAround(Infinity, center);
    expectMatrixCloseTo(resultInf, MatrixUtils.identity());
  });

  it("scaling() should create a correct scaling matrix", () => {
    const m = MatrixUtils.scaling(2, 0.5);
    expectMatrixCloseTo(m, [2, 0, 0, 0, 0.5, 0, 0, 0, 1]);
  });
  it("scalingInPlace() should set scaling correctly", () => {
    const m = MatrixUtils.identity();
    MatrixUtils.scalingInPlace(m, 2, 0.5);
    expectMatrixCloseTo(m, [2, 0, 0, 0, 0.5, 0, 0, 0, 1]);
  });
  it("scalingInPlace() should throw MatrixError for invalid target", () => {
    expect(() => MatrixUtils.scalingInPlace(null as any, 1, 1)).toThrow(
      MatrixError
    );
  });
  it("scalingInPlace() should handle invalid sx and sy by setting them to 1", () => {
    const target = MatrixUtils.identity();
    MatrixUtils.scalingInPlace(target, NaN, 5);
    expectMatrixCloseTo(target, [1, 0, 0, 0, 5, 0, 0, 0, 1]); // S(1, 5)
    MatrixUtils.identityInPlace(target);
    MatrixUtils.scalingInPlace(target, 10, Infinity);
    expectMatrixCloseTo(target, [10, 0, 0, 0, 1, 0, 0, 0, 1]); // S(10, 1)
    MatrixUtils.identityInPlace(target);
    MatrixUtils.scalingInPlace(target, NaN, Infinity);
    expectMatrixCloseTo(target, [1, 0, 0, 0, 1, 0, 0, 0, 1]); // S(1, 1) = I
  });
  it("scalingInPlace() should warn for near-zero scale factors", () => {
    const target = MatrixUtils.identity();
    const epsilon = MatrixUtils.getEpsilon();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    MatrixUtils.scalingInPlace(target, epsilon / 2, 2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Near-zero scale factor")
    );
    warnSpy.mockClear();
    MatrixUtils.scalingInPlace(target, 3, -epsilon / 3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Near-zero scale factor")
    );
    warnSpy.mockRestore();
  });

  it("scalingAround() should create a correct scaling matrix around a center", () => {
    const sx = 2,
      sy = 0.5;
    const center: Point = { x: 10, y: 20 };
    // T(c) * S(sx,sy) * T(-c) -> Col-Major: [2, 0, 0, 0, 0.5, 0, -10, 10, 1]
    const m = MatrixUtils.scalingAround(sx, sy, center);
    expectMatrixCloseTo(m, [2, 0, 0, 0, 0.5, 0, -10, 10, 1]);
  });
  it("scalingAround() should throw MatrixError for invalid center point", () => {
    expect(() => MatrixUtils.scalingAround(1, 1, null as any)).toThrow(
      /Invalid center/
    );
    expect(() =>
      MatrixUtils.scalingAround(1, 1, { x: NaN, y: 1 } as Point)
    ).toThrow(/Invalid center/);
  });
  it("scalingAround() should handle invalid sx and sy by setting them to 1", () => {
    const center = { x: 10, y: 20 };
    const resultNaN = MatrixUtils.scalingAround(NaN, 5, center);
    expectMatrixCloseTo(resultNaN, [1, 0, 0, 0, 5, 0, 0, -80, 1]); // Sa(1, 5, C)
    const resultInf = MatrixUtils.scalingAround(10, Infinity, center);
    expectMatrixCloseTo(resultInf, [10, 0, 0, 0, 1, 0, -90, 0, 1]); // Sa(10, 1, C)
    const resultBoth = MatrixUtils.scalingAround(NaN, NaN, center);
    expectMatrixCloseTo(resultBoth, [1, 0, 0, 0, 1, 0, 0, 0, 1]); // Sa(1, 1, C) = I
  });
});
