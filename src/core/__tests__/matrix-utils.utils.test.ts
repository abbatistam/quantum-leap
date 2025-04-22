// src/__tests__/matrix-utils.utils.test.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatrixUtils } from "../matrix/MatrixUtils"; // Ajusta ruta
// Importamos SOLO para tipos si es necesario, el mock reemplaza la implementación.
import type {
  ScaleCommand,
  TranslateCommand,
  TransformCommand,
} from "../commands";
import type { Matrix3x3 } from "../../types/core.types"; // Ajusta ruta
import { MatrixError } from "../../types/errors.model"; // Ajusta ruta
import { expectMatrixCloseTo } from "./matrix-test-helpers"; // Importa helper

// --- MOCK DE COMANDOS (Enfoque Simplificado y Síncrono) ---
// Usamos vi.mock para REEMPLAZAR completamente los exports del módulo '../commands'
// con nuestros mocks síncronos para este test.
vi.mock("../commands", () => {
  // Mock SÍNCRONO para TranslateCommand
  const MockTranslateCommand = class {
    public dx: number; // Usamos los mismos nombres para conveniencia
    public dy: number;

    constructor(dx: number, dy: number) {
      this.dx = dx;
      this.dy = dy;
    }

    // Execute SÍNCRONO que devuelve Matrix3x3 directamente
    execute(currentMatrix: Matrix3x3): Matrix3x3 {
      const commandMatrix = MatrixUtils.translation(this.dx, this.dy);
      return MatrixUtils.multiply(commandMatrix, currentMatrix);
    }
    // Añadir métodos dummy si son accedidos por combine (p.ej., para warnings)
    toString() {
      return `MockTranslate(${this.dx}, ${this.dy})`;
    }
    toJSON() {
      return { type: "MockTranslate", dx: this.dx, dy: this.dy };
    }
    get name() {
      return "MockTranslate";
    } // Si se accede a 'name'
  };

  // Mock SÍNCRONO para ScaleCommand
  const MockScaleCommand = class {
    public sx: number;
    public sy: number;

    constructor(sx: number, sy: number) {
      this.sx = sx;
      this.sy = sy;
    }

    // Execute SÍNCRONO que devuelve Matrix3x3 directamente
    execute(currentMatrix: Matrix3x3): Matrix3x3 {
      const commandMatrix = MatrixUtils.scaling(this.sx, this.sy);
      return MatrixUtils.multiply(commandMatrix, currentMatrix);
    }
    // Añadir métodos dummy si son necesarios
    toString() {
      return `MockScale(${this.sx}, ${this.sy})`;
    }
    toJSON() {
      return { type: "MockScale", sx: this.sx, sy: this.sy };
    }
    get name() {
      return "MockScale";
    }
  };

  // Devolver el objeto que define los exports mockeados
  // TypeScript usará estos tipos para las importaciones en este archivo de test
  return {
    TranslateCommand: MockTranslateCommand,
    ScaleCommand: MockScaleCommand,
    // Si otros comandos son importados, móckealos también o exporta undefined/null
    // RotateCommand: class MockRotateCommand { ... },
    // La interfaz TransformCommand no se puede mockear directamente como clase,
    // pero ya no la necesitamos para castear porque nuestros mocks son síncronos.
    // Si el código chequeara 'instanceof TransformCommand', necesitaríamos ajustar.
  };
});
// --- FIN MOCK ---

describe("MatrixUtils - Utilities & Combine (No Pooling)", () => {
  // ¡Importante! Necesitamos re-importar las clases DESPUÉS del mock
  // para obtener las versiones mockeadas. Lo hacemos dentro de beforeEach
  // o directamente en los tests si es más simple.
  let m1: Matrix3x3, m2: Matrix3x3;
  let MockedTranslateCommand: any;
  let MockedScaleCommand: any;
  const defaultEpsilon = 1e-6; // O el valor inicial en MatrixUtils
  const testEpsilon = 1e-6;

  beforeEach(async () => {
    vi.restoreAllMocks();
    MatrixUtils.setEpsilon(1e-6);

    // Cargamos dinámicamente las CLASES MOCKEADAS
    // Esto asegura que obtenemos las clases definidas DENTRO de vi.mock
    const commands = await import("../commands");
    MockedTranslateCommand = commands.TranslateCommand;
    MockedScaleCommand = commands.ScaleCommand;
    m1 = MatrixUtils.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);
    m2 = MatrixUtils.clone(m1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getEpsilon should return the current epsilon value", () => {
    expect(MatrixUtils.getEpsilon()).toBe(defaultEpsilon);
  });

  it("setEpsilon should update the epsilon value", () => {
    const newEpsilon = 1e-8;
    MatrixUtils.setEpsilon(newEpsilon);
    expect(MatrixUtils.getEpsilon()).toBe(newEpsilon);
  });

  it("setEpsilon should handle non-positive values (assuming it defaults)", () => {
    // ... (test como antes) ...
    const currentEpsilon = MatrixUtils.getEpsilon();
    MatrixUtils.setEpsilon(0);
    expect(MatrixUtils.getEpsilon()).toBeGreaterThan(0);
    MatrixUtils.setEpsilon(-1e-5);
    expect(MatrixUtils.getEpsilon()).toBeGreaterThan(0);
  });

  it("determinant should calculate correctly for non-singular matrix", () => {
    // ... (test como antes) ...
    const m = MatrixUtils.fromValues(1, 0, 0, 0, 2, 0, 0, 0, 3);
    expect(MatrixUtils.determinant(m)).toBeCloseTo(6);
    const mComplex = MatrixUtils.fromValues(1, 2, 3, 0, 1, 4, 5, 6, 0);
    expect(MatrixUtils.determinant(mComplex)).toBeCloseTo(1);
  });

  it("determinant should calculate correctly for singular matrix (det=0)", () => {
    // ... (test como antes) ...
    const singularMatrix = MatrixUtils.fromValues(1, 2, 3, 2, 4, 6, 7, 8, 9);
    expect(MatrixUtils.determinant(singularMatrix)).toBeCloseTo(0);
    const zeroScaleMatrix = MatrixUtils.scaling(0, 5);
    expect(MatrixUtils.determinant(zeroScaleMatrix)).toBeCloseTo(0);
  });

  it("equals should return true for identical matrices", () => {
    expectMatrixCloseTo(m1, m2, testEpsilon);
  });

  it("should consider different matrices as not close", () => {
    // Renombrado para claridad
    m2[8] += 1; // Hacerlas diferentes
    // Verificar que la comparación cercana FALLE (lance error)
    expect(() => expectMatrixCloseTo(m1, m2, testEpsilon)).toThrow();
  });

  it("equals should return true for matrices within epsilon", () => {
    const epsilon = MatrixUtils.getEpsilon();
    m2[0] += epsilon / 2;
    m2[5] -= epsilon / 3;
    expectMatrixCloseTo(m1, m2, testEpsilon);
  });

  it("equals should return false for matrices outside epsilon", () => {
    const epsilon = MatrixUtils.getEpsilon();
    m2[0] += epsilon * 1.1;
    expectMatrixCloseTo(m1, m2, testEpsilon);
  });

  it("combine() should return the final matrix after successful execution", () => {
    // Usamos las clases mockeadas cargadas en beforeEach
    const cmd1 = new MockedTranslateCommand(10, 5);
    const cmd2 = new MockedScaleCommand(2, 1);
    // El array puede ser de tipo 'any' o del tipo base que combine espere
    // (si no es estrictamente TransformCommand)
    const commands: any[] = [cmd1, cmd2];

    const expectedResult = MatrixUtils.multiply(
      MatrixUtils.scaling(2, 1),
      MatrixUtils.translation(10, 5)
    );
    // combine llamará a los métodos execute SÍNCRONOS de nuestros mocks
    const result = MatrixUtils.combine(commands);
    expectMatrixCloseTo(result, expectedResult);
  });

  // ... (test: combine empty, invalid input, skip invalid ...)
  it("combine() should warn and skip various invalid command objects in the array", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cmd1 = new MockedTranslateCommand(10, 0); // Usa la clase mockeada
    const invalidCmdNull = null;
    const invalidCmdUndefined = undefined;
    // Este objeto no tiene un método 'execute', será detectado por combine
    const invalidCmdNoExecute = {
      name: "no-execute",
      toJSON: () => ({}),
      toString: () => "",
    };
    const cmd5 = new MockedScaleCommand(2, 1); // Usa la clase mockeada
    const commands: any[] = [
      cmd1,
      invalidCmdNull,
      invalidCmdUndefined,
      invalidCmdNoExecute,
      cmd5,
    ];

    const expectedResult = MatrixUtils.multiply(
      MatrixUtils.scaling(2, 1),
      MatrixUtils.translation(10, 0)
    );
    const result = MatrixUtils.combine(commands);

    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid command object"),
      null
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid command object"),
      undefined
    );
    // Verifica que el objeto sin execute también se reporte
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid command object"),
      invalidCmdNoExecute
    );
    expectMatrixCloseTo(result, expectedResult);
    warnSpy.mockRestore();
  });

  it("combine() should handle errors during command execution and rethrow", () => {
    const cmd1 = new MockedTranslateCommand(10, 0); // Mocked
    const errorMsg = "Test execution failure";

    // errorCmd: Objeto simple con execute SÍNCRONO que lanza error.
    // Ya no necesitamos castear a TransformCommand porque el mock es diferente.
    const errorCmd = {
      name: "error-command",
      execute: (): Matrix3x3 => {
        // Directamente síncrono
        throw new Error(errorMsg);
      },
      toString: () => "ErrorCommand",
      toJSON: () => ({ type: "error" as any }),
    };
    const cmd3 = new MockedScaleCommand(2, 2); // Mocked
    const commands: any[] = [cmd1, errorCmd, cmd3]; // Usa any[] para flexibilidad
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => MatrixUtils.combine(commands)).toThrow(errorMsg);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error during MatrixUtils.combine execution:"),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it("setEpsilon should warn for non-positive values", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const initialEpsilon = MatrixUtils.getEpsilon();

    MatrixUtils.setEpsilon(0);
    // Espera UN argumento que contenga el texto y el valor 0
    expect(warnSpy).toHaveBeenCalledWith(
      `MatrixUtils.setEpsilon: Invalid epsilon value provided: 0`
    );
    expect(MatrixUtils.getEpsilon()).toBe(initialEpsilon); // No debería cambiar

    // Limpiar llamada anterior para la siguiente aserción
    warnSpy.mockClear();

    MatrixUtils.setEpsilon(-0.1);
    // Espera UN argumento que contenga el texto y el valor -0.1
    expect(warnSpy).toHaveBeenCalledWith(
      `MatrixUtils.setEpsilon: Invalid epsilon value provided: -0.1`
    );
    expect(MatrixUtils.getEpsilon()).toBe(initialEpsilon); // No debería cambiar

    warnSpy.mockRestore();
  });

  it("applyMatrixInPlace should warn if input matrix 'm' is invalid", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const targetMatrix = MatrixUtils.identity();
    const originalTarget = MatrixUtils.clone(targetMatrix);

    MatrixUtils.applyMatrixInPlace(targetMatrix, null as any);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid input matrix 'm'")
    );
    // Target no debería haber cambiado
    expectMatrixCloseTo(targetMatrix, originalTarget);

    MatrixUtils.applyMatrixInPlace(targetMatrix, [1, 2] as any);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid input matrix 'm'")
    );
    expectMatrixCloseTo(targetMatrix, originalTarget);

    warnSpy.mockRestore();
  });
});
