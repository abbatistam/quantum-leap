/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { AffineTransform } from "../matrix/AffineTransform"; // Ajusta ruta
import { MatrixUtils } from "../matrix/MatrixUtils"; // Ajusta ruta
import type { Rect } from "../../types/core.types"; // Ajusta ruta
import { MatrixError } from "../../types/errors.model"; // Asumo que sigue existiendo
import {
  expectMatrixCloseTo,
  expectPointCloseTo,
  expectRectCloseTo,
} from "./testUtils"; // Ajusta ruta

describe("AffineTransform (Async Immutable)", () => {
  // Changed description slightly
  // Helpers para matrices esperadas
  const getIdentityMatrix = (): number[] => [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const getTranslationMatrix = (dx: number, dy: number): number[] => [
    1,
    0,
    0,
    0,
    1,
    0,
    dx,
    dy,
    1,
  ];
  const getScalingMatrix = (sx: number, sy: number): number[] => [
    sx,
    0,
    0,
    0,
    sy,
    0,
    0,
    0,
    1,
  ];
  const getRotationMatrix = (angle: number): number[] => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [c, s, 0, -s, c, 0, 0, 0, 1];
  };
  const defaultTolerance = 1e-6; // Define default tolerance

  // --- Constructor y Métodos Estáticos (Síncronos) ---

  it("constructor should initialize with identity if no matrix provided", () => {
    const transform = new AffineTransform();
    const m = transform.toMatrix();
    expectMatrixCloseTo(m, getIdentityMatrix(), defaultTolerance);
  });

  it("constructor should always clone input matrix", () => {
    const matrix = MatrixUtils.translation(5, 5);
    const transform = new AffineTransform(matrix);
    const internalMatrix = transform["matrix"];
    expect(internalMatrix).not.toBe(matrix);
    expectMatrixCloseTo(internalMatrix, matrix, defaultTolerance);
  });

  it("constructor should throw MatrixError for invalid matrix", () => {
    expect(() => new AffineTransform(new Float32Array(8) as any)).toThrow(
      MatrixError
    );
    expect(() => new AffineTransform([1] as any)).toThrow(MatrixError);
    expect(() => new AffineTransform(null as any)).toThrow(MatrixError);
  });

  it("static fromMatrix should create a new instance cloning the matrix", () => {
    const matrix = MatrixUtils.scaling(2, 2);
    const transform = AffineTransform.fromMatrix(matrix);
    const internalMatrix = transform["matrix"];
    expect(transform).toBeInstanceOf(AffineTransform);
    expect(internalMatrix).not.toBe(matrix);
    expectMatrixCloseTo(internalMatrix, matrix, defaultTolerance);
  });

  it("static fromTranslation creates a translation transform", () => {
    const transform = AffineTransform.fromTranslation(1, 2);
    const m = transform.toMatrix();
    const expected = getTranslationMatrix(1, 2);
    expectMatrixCloseTo(m, expected, defaultTolerance);
  });

  it("static fromRotation creates a rotation transform", () => {
    const angle = Math.PI / 2;
    const transform = AffineTransform.fromRotation(angle);
    const m = transform.toMatrix();
    const expected = getRotationMatrix(angle);
    expectMatrixCloseTo(m, expected, defaultTolerance);
  });

  it("static fromScaling creates a scaling transform", () => {
    const transform = AffineTransform.fromScaling(3, -1);
    const m = transform.toMatrix();
    const expected = getScalingMatrix(3, -1);
    expectMatrixCloseTo(m, expected, defaultTolerance);
  });

  // --- Métodos Mutables (Síncronos) ---

  it("translate() should modify instance", () => {
    const transform = new AffineTransform();
    const originalMatrixRef = transform.matrix;
    transform.translate(10, 5);
    const m = transform.toMatrix();
    const expected = getTranslationMatrix(10, 5);
    expectMatrixCloseTo(m, expected, defaultTolerance);
    expect(transform.matrix).toBe(originalMatrixRef);
  });

  it("scale() should modify instance", () => {
    const transform = new AffineTransform(MatrixUtils.translation(10, 0));
    const originalMatrixRef = transform.matrix;
    transform.scale(2, 3);
    const m = transform.toMatrix();
    const expected = [2, 0, 0, 0, 3, 0, 20, 0, 1]; // S * T
    expectMatrixCloseTo(m, expected, defaultTolerance);
    expect(transform.matrix).toBe(originalMatrixRef);
  });

  it("rotate() should modify instance", () => {
    const transform = new AffineTransform(MatrixUtils.translation(10, 0));
    const originalMatrixRef = transform.matrix;
    transform.rotate(Math.PI / 2);
    const m = transform.toMatrix();
    const expected = [0, 1, 0, -1, 0, 0, 0, 10, 1]; // R * T
    expectMatrixCloseTo(m, expected, defaultTolerance);
    expect(transform.matrix).toBe(originalMatrixRef);
  });

  it("compose() should modify instance", () => {
    const transform = new AffineTransform(MatrixUtils.translation(10, 0));
    const originalMatrixRef = transform.matrix;
    const otherTransform = AffineTransform.fromScaling(2, 1); // S(2,1)

    transform.compose(otherTransform); // S * T
    const m = transform.toMatrix();
    const expected = [2, 0, 0, 0, 1, 0, 20, 0, 1];
    expectMatrixCloseTo(m, expected, defaultTolerance);
    expect(transform.matrix).toBe(originalMatrixRef);
  });

  it("reset() should reset to identity and change internal matrix instance", () => {
    const initialMatrix = MatrixUtils.translation(5, 5);
    const transform = new AffineTransform(initialMatrix);
    const oldMatrixInternalRef = transform.matrix;

    transform.reset(); // Síncrono

    const newMatrixInternalRef = transform.matrix;
    expectMatrixCloseTo(
      newMatrixInternalRef,
      getIdentityMatrix(),
      defaultTolerance
    );
    expect(newMatrixInternalRef).not.toBe(oldMatrixInternalRef);
  });

  // --- Métodos Inmutables (NUEVOS TESTS - AHORA ASÍNCRONOS) ---

  it("translated() should return a new instance with translation applied", async () => {
    // <-- async
    const transform = new AffineTransform();
    const originalMatrix = transform.toMatrix();

    //           v-- await --v
    const translatedTransform = await transform.translated(10, 5);
    const translatedMatrix = translatedTransform.toMatrix();
    const expectedMatrix = getTranslationMatrix(10, 5);

    expect(translatedTransform).not.toBe(transform);
    expectMatrixCloseTo(translatedMatrix, expectedMatrix, defaultTolerance);
    expectMatrixCloseTo(transform.toMatrix(), originalMatrix, defaultTolerance);
  });

  it("scaled() should return a new instance with scaling applied", async () => {
    // <-- async
    const transform = new AffineTransform(MatrixUtils.translation(10, 0));
    const originalMatrix = transform.toMatrix();

    //       v-- await --v
    const scaledTransform = await transform.scaled(2, 3);
    const scaledMatrix = scaledTransform.toMatrix();
    const expectedMatrix = [2, 0, 0, 0, 3, 0, 20, 0, 1];

    expect(scaledTransform).not.toBe(transform);
    expectMatrixCloseTo(scaledMatrix, expectedMatrix, defaultTolerance);
    expectMatrixCloseTo(transform.toMatrix(), originalMatrix, defaultTolerance);
  });

  it("rotated() should return a new instance with rotation applied", async () => {
    // <-- async
    const transform = new AffineTransform(MatrixUtils.translation(10, 0));
    const originalMatrix = transform.toMatrix();

    //       v-- await --v
    const rotatedTransform = await transform.rotated(Math.PI / 2);
    const rotatedMatrix = rotatedTransform.toMatrix();
    const expectedMatrix = [0, 1, 0, -1, 0, 0, 0, 10, 1];

    expect(rotatedTransform).not.toBe(transform);
    expectMatrixCloseTo(rotatedMatrix, expectedMatrix, defaultTolerance);
    expectMatrixCloseTo(transform.toMatrix(), originalMatrix, defaultTolerance);
  });

  it("composed() should return a new instance with composition applied", async () => {
    // <-- async
    const transform = new AffineTransform(MatrixUtils.translation(10, 0));
    const originalMatrix = transform.toMatrix();
    const otherTransform = AffineTransform.fromScaling(2, 1);

    //        v-- await --v
    const composedTransform = await transform.composed(otherTransform);
    const composedMatrix = composedTransform.toMatrix();
    const expectedMatrix = [2, 0, 0, 0, 1, 0, 20, 0, 1];

    expect(composedTransform).not.toBe(transform);
    expectMatrixCloseTo(composedMatrix, expectedMatrix, defaultTolerance);
    expectMatrixCloseTo(transform.toMatrix(), originalMatrix, defaultTolerance);
  });

  // --- Otros Métodos ---

  it("invert() should return a new AffineTransform with the inverse matrix", async () => {
    // <-- async
    const matrix = MatrixUtils.translation(10, 5);
    const transform = new AffineTransform(matrix);
    //             v-- await --v
    const invertedTransform = await transform.invert();

    // Check for null before proceeding
    expect(invertedTransform).not.toBeNull();
    if (!invertedTransform) return; // Type guard for TypeScript

    const invM = invertedTransform.toMatrix();
    const expectedInvM = getTranslationMatrix(-10, -5);

    expect(invertedTransform).not.toBe(transform);
    expectMatrixCloseTo(invM, expectedInvM, defaultTolerance);
  });

  it("invert() should return null if matrix is singular", async () => {
    // <-- async
    const matrix = MatrixUtils.scaling(0, 1); // Singular matrix
    const transform = new AffineTransform(matrix);
    //         v-- await --v
    const result = await transform.invert();
    expect(result).toBeNull();
  });

  // applyToPoint/Rect siguen síncronos según la implementación actual de AffineTransform
  it("applyToPoint() should transform a point", () => {
    const transform = AffineTransform.fromTranslation(10, 20);
    const p = { x: 1, y: 2 };
    const transformedP = transform.applyToPoint(p);
    expectPointCloseTo(transformedP, { x: 11, y: 22 }, defaultTolerance);
  });

  it("applyToRect() should transform a rect", () => {
    const transform = AffineTransform.fromScaling(2, 0.5);
    const r: Rect = { x: 10, y: 10, width: 10, height: 20 };
    const transformedR = transform.applyToRect(r);
    const expectedR: Rect = { x: 20, y: 5, width: 20, height: 10 };
    expectRectCloseTo(transformedR, expectedR, defaultTolerance);
  });

  // clone y toMatrix siguen síncronos
  it("clone() should create an independent copy", () => {
    const transform = new AffineTransform(MatrixUtils.translation(1, 1));
    const clone = transform.clone();

    expect(clone).not.toBe(transform);
    expect(clone["matrix"]).not.toBe(transform["matrix"]);
    expectMatrixCloseTo(
      clone.toMatrix(),
      transform.toMatrix(),
      defaultTolerance
    );

    transform.translate(10, 10); // Modifica original (síncrono)
    expect(clone.toMatrix()[6]).toBe(1);
    expect(transform.toMatrix()[6]).toBe(11);
  });

  it("toMatrix() should return a clone", () => {
    const transform = new AffineTransform();
    const m = transform.toMatrix();
    expect(m).not.toBe(transform["matrix"]);
    expectMatrixCloseTo(m, transform["matrix"], defaultTolerance);
  });

  it("translate() should handle invalid inputs and use defaults (0)", () => {
    const transform = new AffineTransform(); // Identidad
    transform.translate(NaN, 5); // dx inválido
    expectMatrixCloseTo(
      transform.toMatrix(),
      getTranslationMatrix(0, 5),
      defaultTolerance
    ); // dx=0
    transform.reset(); // Volver a identidad
    transform.translate(10, Infinity); // dy inválido
    expectMatrixCloseTo(
      transform.toMatrix(),
      getTranslationMatrix(10, 0),
      defaultTolerance
    ); // dy=0
    transform.reset();
    transform.translate(NaN, NaN);
    expectMatrixCloseTo(
      transform.toMatrix(),
      getTranslationMatrix(0, 0),
      defaultTolerance
    ); // dx=0, dy=0 (identidad)
  });

  it("scale() should handle invalid inputs and use defaults (1)", () => {
    const transform = new AffineTransform(); // Identidad
    transform.scale(NaN, 3); // sx inválido
    expectMatrixCloseTo(
      transform.toMatrix(),
      getScalingMatrix(1, 3),
      defaultTolerance
    ); // sx=1
    transform.reset();
    transform.scale(2, Infinity); // sy inválido
    expectMatrixCloseTo(
      transform.toMatrix(),
      getScalingMatrix(2, 1),
      defaultTolerance
    ); // sy=1
    transform.reset();
    transform.scale(NaN, NaN);
    expectMatrixCloseTo(
      transform.toMatrix(),
      getScalingMatrix(1, 1),
      defaultTolerance
    ); // sx=1, sy=1 (identidad)
  });

  it("rotate() should handle invalid input and use default (0)", () => {
    const transform = new AffineTransform(); // Identidad
    transform.rotate(NaN); // angle inválido
    expectMatrixCloseTo(
      transform.toMatrix(),
      getRotationMatrix(0),
      defaultTolerance
    ); // angle=0 (identidad)
  });

  it("compose() should throw error for invalid input", () => {
    const transform = new AffineTransform();
    expect(() => transform.compose(null as any)).toThrow(
      /requires a valid AffineTransform/
    );
    expect(() => transform.compose({} as any)).toThrow(
      /requires a valid AffineTransform/
    );
  });

  it("translated() should handle invalid inputs and use defaults (0)", async () => {
    const transform = new AffineTransform(); // Identidad

    // dx inválido
    let newTransform = await transform.translated(NaN, 5);
    expectMatrixCloseTo(
      newTransform.toMatrix(),
      getTranslationMatrix(0, 5),
      defaultTolerance
    );
    expectMatrixCloseTo(
      transform.toMatrix(),
      getIdentityMatrix(),
      defaultTolerance
    ); // Original sin cambios

    // dy inválido
    newTransform = await transform.translated(10, Infinity);
    expectMatrixCloseTo(
      newTransform.toMatrix(),
      getTranslationMatrix(10, 0),
      defaultTolerance
    );
    expectMatrixCloseTo(
      transform.toMatrix(),
      getIdentityMatrix(),
      defaultTolerance
    ); // Original sin cambios

    // ambos inválidos
    newTransform = await transform.translated(NaN, NaN);
    expectMatrixCloseTo(
      newTransform.toMatrix(),
      getIdentityMatrix(),
      defaultTolerance
    ); // dx=0, dy=0
    expectMatrixCloseTo(
      transform.toMatrix(),
      getIdentityMatrix(),
      defaultTolerance
    ); // Original sin cambios
  });

  it("scaled() should handle invalid inputs and use defaults (1)", async () => {
    const transform = new AffineTransform(); // Identidad

    // sx inválido
    let newTransform = await transform.scaled(NaN, 3);
    expectMatrixCloseTo(
      newTransform.toMatrix(),
      getScalingMatrix(1, 3),
      defaultTolerance
    );
    expectMatrixCloseTo(
      transform.toMatrix(),
      getIdentityMatrix(),
      defaultTolerance
    ); // Original sin cambios

    // sy inválido
    newTransform = await transform.scaled(2, Infinity);
    expectMatrixCloseTo(
      newTransform.toMatrix(),
      getScalingMatrix(2, 1),
      defaultTolerance
    );
    expectMatrixCloseTo(
      transform.toMatrix(),
      getIdentityMatrix(),
      defaultTolerance
    ); // Original sin cambios

    // ambos inválidos
    newTransform = await transform.scaled(NaN, NaN);
    expectMatrixCloseTo(
      newTransform.toMatrix(),
      getIdentityMatrix(),
      defaultTolerance
    ); // sx=1, sy=1
    expectMatrixCloseTo(
      transform.toMatrix(),
      getIdentityMatrix(),
      defaultTolerance
    ); // Original sin cambios
  });

  it("rotated() should handle invalid input and use default (0)", async () => {
    const transform = new AffineTransform(); // Identidad
    const newTransform = await transform.rotated(NaN); // angle inválido
    expectMatrixCloseTo(
      newTransform.toMatrix(),
      getRotationMatrix(0),
      defaultTolerance
    ); // angle=0 (identidad)
    expectMatrixCloseTo(
      transform.toMatrix(),
      getIdentityMatrix(),
      defaultTolerance
    ); // Original sin cambios
  });

  it("composed() should return a new instance with composition applied", async () => {
    // ... (test existente) ...
  });

  it("composed() should throw error for invalid input", async () => {
    const transform = new AffineTransform();
    // Usamos expect(...).rejects para métodos async que lanzan errores
    await expect(transform.composed(null as any)).rejects.toThrow(
      /requires a valid AffineTransform/
    );
    await expect(transform.composed({} as any)).rejects.toThrow(
      /requires a valid AffineTransform/
    );
  });
});
