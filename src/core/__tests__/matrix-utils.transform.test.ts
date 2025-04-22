import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatrixUtils } from "../matrix/MatrixUtils";
import type { Point, Rect, Matrix3x3 } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { expectPointCloseTo, expectRectCloseTo } from "./matrix-test-helpers"; // Importa helpers

describe("MatrixUtils - Geometric Transformations (No Pooling)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Geometric Transformations (Point, Rect) ---
  it("transformPoint() should apply the transformation correctly", () => {
    const matrix1 = MatrixUtils.translation(10, 5);
    const point1: Point = { x: 1, y: 2 };
    const transformedPoint = MatrixUtils.transformPoint(matrix1, point1);
    expectPointCloseTo(transformedPoint, { x: 11, y: 7 });
  });

  it("transformPoint() should use the output point if provided", () => {
    const matrix1 = MatrixUtils.scaling(2, 3);
    const point1: Point = { x: 4, y: 5 };
    const outPoint: Point = { x: 0, y: 0 };
    const result = MatrixUtils.transformPoint(matrix1, point1, outPoint);
    expect(result).toBe(outPoint);
    expectPointCloseTo(result, { x: 8, y: 15 });
  });

  it("transformPoint() should handle perspective division", () => {
    const matrix1 = new Float32Array([1, 0, 0, 0, 1, 0, 1, 0, 2]) as Matrix3x3; // ((x+1)/2, y/2)
    const point1: Point = { x: 2, y: 3 };
    const expectedPoint: Point = { x: 1.5, y: 1.5 };
    const transformedPoint = MatrixUtils.transformPoint(matrix1, point1);
    expectPointCloseTo(transformedPoint, expectedPoint);
  });

  it("transformPoint() should handle w close to zero and warn", () => {
    const matrix1 = new Float32Array([
      1, 0, 0, 0, 1, 0, 0, 0, 1e-12,
    ]) as Matrix3x3;
    const point1: Point = { x: 1, y: 1 };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transformedPoint = MatrixUtils.transformPoint(matrix1, point1);
    expect(transformedPoint.x).toBeNaN();
    expect(transformedPoint.y).toBeNaN();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Perspective division by near-zero W")
    );
    warnSpy.mockRestore();
  });

  it("transformPoint() should throw MatrixError for invalid inputs", () => {
    const validMatrix = MatrixUtils.identity();
    const validPoint: Point = { x: 0, y: 0 };
    expect(() => MatrixUtils.transformPoint(null as any, validPoint)).toThrow(
      /Invalid matrix/
    );
    expect(() =>
      MatrixUtils.transformPoint(new Float32Array(8) as any, validPoint)
    ).toThrow(/Invalid matrix/);
    expect(() => MatrixUtils.transformPoint(validMatrix, null as any)).toThrow(
      /Invalid point/
    );
    expect(() =>
      MatrixUtils.transformPoint(validMatrix, { x: NaN, y: 0 } as Point)
    ).toThrow(/Invalid point/);
  });

  it("transformRect() should calculate the AABB of the transformed rectangle", () => {
    const matrix1 = MatrixUtils.rotation(Math.PI / 2); // Rot 90
    const rect1: Rect = { x: 10, y: 20, width: 30, height: 40 };
    const expectedRect: Rect = { x: -60, y: 10, width: 40, height: 30 };
    const transformedRect = MatrixUtils.transformRect(matrix1, rect1);
    expectRectCloseTo(transformedRect, expectedRect);
  });

  it("transformRect() should use the output rect if provided", () => {
    const matrix1 = MatrixUtils.translation(100, 50);
    const rect1: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const outRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
    const result = MatrixUtils.transformRect(matrix1, rect1, outRect);
    expect(result).toBe(outRect);
    expectRectCloseTo(result, { x: 100, y: 50, width: 10, height: 10 });
  });

  it("transformRect() should handle non-affine matrices", () => {
    const matrix1 = new Float32Array([1, 0, 0, 0, 1, 0, 1, 0, 2]) as Matrix3x3; // ((x+1)/2, y/2)
    const rect1: Rect = { x: 0, y: 0, width: 2, height: 2 };
    const expectedRect: Rect = { x: 0.5, y: 0, width: 1.0, height: 1.0 };
    const transformedRect = MatrixUtils.transformRect(matrix1, rect1);
    expectRectCloseTo(transformedRect, expectedRect);
  });

  it("transformRect() should handle NaN coordinates from transformPoint", () => {
    const matrixNaN_W = new Float32Array([
      1, 0, 0, 0, 1, 0, 0, 0, 0,
    ]) as Matrix3x3; // W=0
    const rectToTest: Rect = { x: 0, y: 0, width: 2, height: 2 };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); // Silence W=0 warnings
    const resultRectW = MatrixUtils.transformRect(matrixNaN_W, rectToTest);
    expect(resultRectW.x).toBeNaN();
    expect(resultRectW.y).toBeNaN();
    expect(resultRectW.width).toBeNaN();
    expect(resultRectW.height).toBeNaN();
    expect(warnSpy).toHaveBeenCalledTimes(4); // Warns for each point transform
    warnSpy.mockRestore();
    // Internal filtering handles NaN correctly as per original test logic description
  });

  it("transformRect() should throw MatrixError for invalid inputs", () => {
    const validMatrix = MatrixUtils.identity();
    const validRect: Rect = { x: 0, y: 0, width: 1, height: 1 };
    expect(() => MatrixUtils.transformRect(null as any, validRect)).toThrow(
      MatrixError
    );
    expect(() =>
      MatrixUtils.transformRect(new Float32Array(8) as any, validRect)
    ).toThrow(MatrixError);
    expect(() => MatrixUtils.transformRect(validMatrix, null as any)).toThrow(
      MatrixError
    );
    expect(() =>
      MatrixUtils.transformRect(validMatrix, {
        x: 0,
        y: 0,
        width: NaN,
        height: 1,
      } as Rect)
    ).toThrow(MatrixError);
  });

  it("transformRect should handle rect with zero width", () => {
    const transform = MatrixUtils.translation(10, 20);
    const zeroWidthRect: Rect = { x: 5, y: 5, width: 0, height: 10 };
    const expected: Rect = { x: 15, y: 25, width: 0, height: 10 };
    const result = MatrixUtils.transformRect(transform, zeroWidthRect);
    expectRectCloseTo(result, expected);

    const scale = MatrixUtils.scaling(2, 3);
    const expectedScaled: Rect = { x: 10, y: 15, width: 0, height: 30 };
    const resultScaled = MatrixUtils.transformRect(scale, zeroWidthRect);
    expectRectCloseTo(resultScaled, expectedScaled);
  });

  it("transformRect should handle rect with zero height", () => {
    const transform = MatrixUtils.translation(10, 20);
    const zeroHeightRect: Rect = { x: 5, y: 5, width: 10, height: 0 };
    const expected: Rect = { x: 15, y: 25, width: 10, height: 0 };
    const result = MatrixUtils.transformRect(transform, zeroHeightRect);
    expectRectCloseTo(result, expected);

    const scale = MatrixUtils.scaling(2, 3);
    const expectedScaled: Rect = { x: 10, y: 15, width: 20, height: 0 };
    const resultScaled = MatrixUtils.transformRect(scale, zeroHeightRect);
    expectRectCloseTo(resultScaled, expectedScaled);
  });

  it("transformRect should handle rect with zero width and height", () => {
    const transform = MatrixUtils.translation(10, 20);
    const zeroRect: Rect = { x: 5, y: 5, width: 0, height: 0 };
    const expected: Rect = { x: 15, y: 25, width: 0, height: 0 };
    const result = MatrixUtils.transformRect(transform, zeroRect);
    expectRectCloseTo(result, expected);
  });

  // Note: transformPointsBatch is async and likely involves WASM setup.
  // It might be better in its own file or grouped with other async/WASM tests if you have more.
  // Keeping it simple for now, let's assume it's tested elsewhere or add it here if needed.
  /*
    it('transformPointsBatch() should call WASM', async () => {
        // Requires mocking transformPointsBatchWasm
        // vi.mock('../wasm/wasm-loader', () => ({
        //     transformPointsBatchWasm: vi.fn().mockResolvedValue(new Float32Array([/* expected output */ /*])),
        // }));
        // const matrix = MatrixUtils.identity();
        // const points = new Float32Array([1, 2, 3, 4]);
        // await MatrixUtils.transformPointsBatch(matrix, points);
        // expect(transformPointsBatchWasm).toHaveBeenCalledWith(matrix, points);
    });
    */
});
