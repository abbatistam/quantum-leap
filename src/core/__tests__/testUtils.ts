import { expect } from 'vitest';
import type { Matrix3x3, Point, Rect } from '../../types/core.types'; // Ajusta ruta

export function expectMatrixCloseTo(
    actual: Matrix3x3,
    expected: number[] | Float32Array,
    epsilon = 1e-6,
) {
    expect(actual).toBeInstanceOf(Float32Array);
    expect(actual.length).toBe(9);
    expect(expected.length).toBe(9); // Ensure expected also has 9 elements

    expected.forEach((expectedVal, i) => {
        const actualVal = actual[i];
        const diff = Math.abs(actualVal - expectedVal);
        expect(diff).toBeLessThanOrEqual(epsilon);
    });
}

export function expectPointCloseTo(actual: Point, expected: Point, epsilon = 1e-6) {
    // Check if points are valid objects (optional but good practice)
    expect(actual).toBeDefined();
    expect(expected).toBeDefined();
    expect(actual).toHaveProperty('x');
    expect(actual).toHaveProperty('y');
    expect(expected).toHaveProperty('x');
    expect(expected).toHaveProperty('y');

    // Calculate the absolute differences
    const diffX = Math.abs(actual.x - expected.x);
    const diffY = Math.abs(actual.y - expected.y);

    // Assert that the differences are within the allowed epsilon
    expect(diffX).toBeLessThanOrEqual(epsilon);
    expect(diffY).toBeLessThanOrEqual(epsilon);
}

export function expectRectCloseTo(actual: Rect, expected: Rect, epsilon = 1e-6) {
    expect(actual.x).toBeCloseTo(expected.x, epsilon);
    expect(actual.y).toBeCloseTo(expected.y, epsilon);
    expect(actual.width).toBeCloseTo(expected.width, epsilon);
    expect(actual.height).toBeCloseTo(expected.height, epsilon);
}
