import { expect } from "vitest";
import type { Matrix3x3, Point, Rect } from "../../types/core.types";

export function expectMatrixCloseTo(
  actual: Matrix3x3 | null,
  expected: number[] | Float32Array | null,
  epsilon = 1e-6
): void {
  if (actual === null) {
    expect(expected).toBeNull();
    return;
  }
  if (expected === null) {
    throw new Error("Expected null matrix but received a Float32Array");
  }
  expect(actual).toBeInstanceOf(Float32Array);
  expect(actual.length).toBe(9);
  expect(expected.length).toBe(9);
  expected.forEach((val, i) => {
    if (actual[i] === undefined || actual[i] === null) {
      throw new Error(
        `Actual matrix element at index ${i} is undefined or null.`
      );
    }
    expect(actual[i]).toBeCloseTo(val, epsilon);
  });
}

export function expectPointCloseTo(
  actual: Point,
  expected: Point,
  epsilon = 1e-6
): void {
  expect(actual.x).toBeCloseTo(expected.x, epsilon);
  expect(actual.y).toBeCloseTo(expected.y, epsilon);
}

export function expectRectCloseTo(
  actual: Rect,
  expected: Rect,
  epsilon = 1e-6
): void {
  expect(actual.x).toBeCloseTo(expected.x, epsilon);
  expect(actual.y).toBeCloseTo(expected.y, epsilon);
  expect(actual.width).toBeCloseTo(expected.width, epsilon);
  expect(actual.height).toBeCloseTo(expected.height, epsilon);
}
