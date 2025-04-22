import { describe, it, expect /*, afterEach ELIMINADO*/ } from "vitest";
import { expectMatrixCloseTo } from "../testUtils"; // Importa el helper
import { TranslateCommand } from "../../commands";
import { MatrixUtils } from "../../matrix/MatrixUtils";

describe("TranslateCommand (No Pooling)", () => {
  // Ya no necesitamos variables globales
  // let initialMatrix: Matrix3x3 | undefined;
  // let command: TranslateCommand | undefined;

  // afterEach eliminado

  it("execute() should apply translation correctly", () => {
    const initialMatrix = MatrixUtils.scaling(2, 2); // Nueva matriz base
    const command = new TranslateCommand(10, -5);

    // Calcular esperado (T * M)
    const expectedTranslateMatrix = MatrixUtils.translation(10, -5);
    const expectedResult = MatrixUtils.multiply(
      expectedTranslateMatrix,
      initialMatrix,
    );

    // Ejecutar
    const resultMatrix = command.execute(initialMatrix); // Devuelve nueva matriz

    // Comparar
    expectMatrixCloseTo(resultMatrix, expectedResult);

    // No hay release
  });

  it("toString() should return a descriptive string", () => {
    const command = new TranslateCommand(15, -8.5);
    expect(command.toString()).toBe("Translate (15.0, -8.5)");
  });

  it("toJSON() should return correct JSON representation", () => {
    const command = new TranslateCommand(10, 20);
    expect(command.toJSON()).toEqual({
      type: "translate",
      dx: 10,
      dy: 20,
    });
  });

  it("should throw error for invalid constructor arguments", () => {
    expect(() => new TranslateCommand(NaN, 10)).toThrowError(
      /Invalid translation/,
    );
    expect(() => new TranslateCommand(10, Infinity)).toThrowError(
      /Invalid translation/,
    );
  });
});
