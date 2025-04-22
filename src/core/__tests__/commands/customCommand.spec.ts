// src/core/__tests__/commands/customCommand.spec.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"; // Quitamos vi
import { CustomTransformCommand } from "../../commands";
import { MatrixUtils } from "../../matrix/MatrixUtils";
import type { Matrix3x3 } from "../../../types/core.types"; // Ajusta rutas
import { expectMatrixCloseTo } from "../testUtils"; // Importa helper
import { MatrixError } from "../../../types/errors.model";

describe("CustomTransformCommand (No Pooling)", () => {
  // Ya no necesitamos variables globales para gestionar release
  // let initialMatrix: Matrix3x3 | undefined;
  // let customMatrix: Matrix3x3 | undefined;
  // let command: CustomTransformCommand | undefined;

  // beforeEach y afterEach ya no son necesarios para este test suite simplificado
  // Si otros tests los necesitaran, se pueden mantener pero sin lógica de release.

  it("execute() should apply the custom matrix correctly", () => {
    const initialMatrix = MatrixUtils.identity(); // Nueva identidad
    const customMatrixValues = MatrixUtils.translation(10, 20); // Nueva T(10,20)

    // El constructor ahora SIEMPRE clona
    const command = new CustomTransformCommand(
      customMatrixValues,
      "My Custom Transform",
    );

    // El resultado esperado es Custom * Initial
    const expectedResult = MatrixUtils.multiply(
      customMatrixValues,
      initialMatrix,
    );
    const resultMatrix = command.execute(initialMatrix);

    expectMatrixCloseTo(resultMatrix, expectedResult);
    // No hay release
  });

  // Test 'execute() should return identity if command resources were released' ELIMINADO

  it("toString() should return the description", () => {
    const customMatrixValues = MatrixUtils.identity();
    const command = new CustomTransformCommand(
      customMatrixValues,
      "Specific Effect",
    );
    expect(command.toString()).toBe("Specific Effect");
    // No hay release
  });

  it("toJSON() should return correct JSON representation", () => {
    const matrixValues = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const customMatrixInput = new Float32Array(matrixValues) as Matrix3x3;

    // El constructor clona la matriz de entrada
    const command = new CustomTransformCommand(customMatrixInput, "JSON Test");
    const jsonResult = command.toJSON();

    expect(jsonResult).toEqual({
      type: "custom",
      matrix: matrixValues, // El JSON debe contener el array numérico
      desc: "JSON Test",
    });

    // Verificar que la matriz en el JSON es un array normal, no Float32Array
    expect(jsonResult.matrix).toBeInstanceOf(Array);
    expect(jsonResult.matrix).not.toBeInstanceOf(Float32Array);
    // Verificar que no es la misma instancia que la entrada original
    expect(jsonResult.matrix).not.toBe(matrixValues); // toEqual hace copia profunda
    // No hay release
  });

  it("constructor should throw MatrixError for invalid matrix input", () => {
    const validDesc = "Test Description";

    // Caso 1: null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new CustomTransformCommand(null as any, validDesc)).toThrow(
      MatrixError,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new CustomTransformCommand(null as any, validDesc)).toThrow(
      /Invalid matrix for CustomTransformCommand/,
    );

    // Caso 2: Float32Array de tamaño incorrecto
    const wrongSizeArray = new Float32Array(5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(
      () => new CustomTransformCommand(wrongSizeArray as any, validDesc),
    ).toThrow(MatrixError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(
      () => new CustomTransformCommand(wrongSizeArray as any, validDesc),
    ).toThrow(/Invalid matrix for CustomTransformCommand/);

    // Caso 3: Array normal
    const normalArray = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(
      () => new CustomTransformCommand(normalArray as any, validDesc),
    ).toThrow(MatrixError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(
      () => new CustomTransformCommand(normalArray as any, validDesc),
    ).toThrow(/Invalid matrix for CustomTransformCommand/);

    // Caso 4: Objeto vacío
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new CustomTransformCommand({} as any, validDesc)).toThrow(
      MatrixError,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new CustomTransformCommand({} as any, validDesc)).toThrow(
      /Invalid matrix for CustomTransformCommand/,
    );
  });
});
