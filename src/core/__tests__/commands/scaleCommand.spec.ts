import { describe, it, expect } from "vitest";
import { ScaleCommand } from "../../commands";
import { MatrixUtils } from "../../matrix/MatrixUtils";
import type { Point } from "../../../types/core.types"; // Ajusta rutas
import { expectMatrixCloseTo } from "../testUtils"; // Importa helper

describe("ScaleCommand (No Pooling)", () => {
  // Ya no necesitamos variables globales
  // let initialMatrix: Matrix3x3 | undefined;
  // let command: ScaleCommand | undefined;

  // afterEach eliminado

  it("execute() should apply scaling correctly (no center)", () => {
    const initialMatrix = MatrixUtils.translation(10, 5); // Nueva matriz base
    const command = new ScaleCommand(2, 0.5);

    // Calcular resultado esperado (S * M)
    const expectedScaleMatrix = MatrixUtils.scaling(2, 0.5);
    const expectedResult = MatrixUtils.multiply(
      expectedScaleMatrix,
      initialMatrix,
    );

    // Ejecutar
    const resultMatrix = command.execute(initialMatrix); // Devuelve nueva matriz

    // Comparar
    expectMatrixCloseTo(resultMatrix, expectedResult);

    // No hay release
  });

  it("execute() should apply scaling around a center correctly", () => {
    const initialMatrix = MatrixUtils.identity(); // Nueva matriz base
    const center: Point = { x: 10, y: 20 };
    const command = new ScaleCommand(1.5, 3, center);

    // Calcular resultado esperado (Sa * M)
    const expectedScaleMatrix = MatrixUtils.scalingAround(1.5, 3, center);
    const expectedResult = MatrixUtils.multiply(
      expectedScaleMatrix,
      initialMatrix,
    );

    // Ejecutar
    const resultMatrix = command.execute(initialMatrix); // Devuelve nueva matriz

    // Comparar
    // El resultado directo de execute DEBERÍA ser igual a expectedResult
    expectMatrixCloseTo(resultMatrix, expectedResult);
    // También podemos comparar con la matriz de escalado alrededor, ya que M=Identidad
    expectMatrixCloseTo(resultMatrix, expectedScaleMatrix);

    // No hay release
  });

  it("toString() should return a descriptive string (no center)", () => {
    const command = new ScaleCommand(1.25, 0.75);
    expect(command.toString()).toBe("Scale (1.25, 0.75)");
  });

  it("toString() should return a descriptive string (with center)", () => {
    const command = new ScaleCommand(2, 3, { x: 10, y: -5 });
    expect(command.toString()).toBe("Scale (2.00, 3.00) around (10.0,-5.0)");
  });

  it("toJSON() should return correct JSON representation (no center)", () => {
    const command = new ScaleCommand(0.5, 4);
    expect(command.toJSON()).toEqual({
      type: "scale",
      sx: 0.5,
      sy: 4,
    });
  });

  it("toJSON() should return correct JSON representation (with center)", () => {
    const center: Point = { x: 1, y: 2 };
    const command = new ScaleCommand(1, 1, center);
    const json = command.toJSON();
    expect(json).toEqual({
      type: "scale",
      sx: 1,
      sy: 1,
      center: { x: 1, y: 2 },
    });
    expect(json.center).not.toBe(center);
  });

  it("should throw error for invalid constructor arguments", () => {
    expect(() => new ScaleCommand(NaN, 1)).toThrowError(/Invalid scale/);
    expect(() => new ScaleCommand(1, Infinity)).toThrowError(/Invalid scale/);
    expect(() => new ScaleCommand(0, 1)).toThrowError(/cannot be zero/);
    expect(() => new ScaleCommand(1, 1e-12)).toThrowError(/cannot be zero/); // Test near-zero too
    expect(() => new ScaleCommand(1, 1, { x: NaN, y: 0 })).toThrowError(
      /Invalid center/,
    );
  });
});
