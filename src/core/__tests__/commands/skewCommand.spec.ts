import { describe, it, expect } from "vitest";
import type { Matrix3x3 } from "../../../types/core.types";
import { expectMatrixCloseTo } from "../testUtils";
import { SkewCommand } from "../../commands";
import { MatrixUtils } from "../../matrix/MatrixUtils";

describe("SkewCommand (No Pooling)", () => {
  // Ya no necesitamos variables globales
  // let initialMatrix: Matrix3x3 | undefined;
  // let command: SkewCommand | undefined;

  // afterEach eliminado

  it("execute() should apply skew correctly", () => {
    const initialMatrix = MatrixUtils.translation(10, 5); // Nueva matriz base
    const skewX = 0.5; // rad
    const skewY = -0.2; // rad
    const command = new SkewCommand(skewX, skewY);

    // Calcular la matriz de skew esperada (nueva)
    const tx = Math.tan(skewX);
    const ty = Math.tan(skewY);
    // Nota: La creación directa de la matriz de skew sigue la lógica original,
    // asegúrate de que coincida con la de SkewCommand.execute si la cambiaste.
    const expectedSkewMatrix = new Float32Array([
      1,
      tx,
      0,
      ty,
      1,
      0,
      0,
      0,
      1,
    ]) as Matrix3x3;

    // Calcular resultado esperado (Sk * M)
    const expectedResult = MatrixUtils.multiply(
      expectedSkewMatrix,
      initialMatrix,
    );

    // Ejecutar
    const resultMatrix = command.execute(initialMatrix); // Devuelve nueva matriz

    // Comparar
    expectMatrixCloseTo(resultMatrix, expectedResult);

    // No hay release
  });

  it("toString() should return a descriptive string", () => {
    const skewX = 0.123;
    const skewY = -0.456;
    const command = new SkewCommand(skewX, skewY);
    expect(command.toString()).toBe("Skew (0.12 rad, -0.46 rad)");
  });

  it("toJSON() should return correct JSON representation", () => {
    const skewX = 0.7;
    const skewY = 0.1;
    const command = new SkewCommand(skewX, skewY);
    expect(command.toJSON()).toEqual({
      type: "skew",
      skewX: skewX,
      skewY: skewY,
    });
  });

  it("should throw error for invalid constructor arguments", () => {
    expect(() => new SkewCommand(NaN, 0)).toThrowError(/Invalid skew/);
    expect(() => new SkewCommand(0, Infinity)).toThrowError(/Invalid skew/);
  });
});
