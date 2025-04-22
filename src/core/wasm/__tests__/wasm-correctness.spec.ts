// src/core/wasm/__tests__/wasm-correctness.spec.ts

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  beforeAll,
  afterAll,
} from "vitest";
import {
  loadWasmModule,
  transformPointsBatchWasm_Copy,
  cleanupWasm,
} from "../wasm-loader"; // Ajusta ruta
import { MatrixUtils } from "../../matrix/MatrixUtils"; // Ajusta ruta
import type { Matrix3x3, Point } from "../../../types/core.types"; // Ajusta ruta
// Asumiendo que expectPointCloseTo está en testUtils y es exportado
import { expectPointCloseTo } from "../../__tests__/testUtils"; // Ajusta ruta

// --- Función de Referencia (JS) ---
function transformPointsBatchJS(
  matrix: Matrix3x3,
  pointsIn: Float32Array
): Float32Array {
  const numPoints = pointsIn.length / 2;
  const pointsOut = new Float32Array(numPoints * 2);
  const p: Point = { x: 0, y: 0 }; // Objeto reutilizable
  const p_out: Point = { x: 0, y: 0 }; // Objeto reutilizable
  for (let i = 0; i < numPoints; i++) {
    p.x = pointsIn[i * 2];
    p.y = pointsIn[i * 2 + 1];
    MatrixUtils.transformPoint(matrix, p, p_out); // Usar la utilidad JS como referencia
    pointsOut[i * 2] = p_out.x;
    pointsOut[i * 2 + 1] = p_out.y;
  }
  return pointsOut;
}

// --- Comparador de Arrays ---
function expectFloatArrayCloseTo(
  actual: Float32Array,
  expected: Float32Array,
  epsilon: number = 1e-5
) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    if (isNaN(expected[i])) {
      expect(isNaN(actual[i])).toBe(true);
    } else {
      expect(isNaN(actual[i])).toBe(false); // Asegurar que el actual no sea NaN si el esperado no lo es
      expect(actual[i]).toBeCloseTo(expected[i], epsilon);
    }
  }
}

describe("WASM Correctness - transformPointsBatchWasm", () => {
  // Carga real del módulo WASM (sin mocks aquí!)
  // Asegúrate de que el WASM esté construido y accesible
  beforeAll(async () => {
    try {
      await loadWasmModule(); // Cargar una vez para todos los tests
    } catch (e) {
      console.error("FALLO AL CARGAR WASM PARA TESTS DE CORRECTITUD", e);
      // Lanzar error para detener los tests si WASM no carga
      throw new Error("No se pudo cargar WASM para los tests de correctitud.");
    }
  });

  afterAll(() => {
    cleanupWasm(); // Limpiar al final
  });

  // --- Casos de Prueba ---
  const testCases: { name: string; matrix: Matrix3x3; points: number[] }[] = [
    {
      name: "Identity Matrix",
      matrix: MatrixUtils.identity(),
      points: [0, 0, 1, 0, 0, 1, 1, 1, -10, 5, 100, 200], // Incluye varios puntos (múltiplo de 4 + 2)
    },
    {
      name: "Translation",
      matrix: MatrixUtils.translation(10, -20),
      points: [0, 0, 1, 2, -5, -5], // 3 puntos (no múltiplo de 4)
    },
    {
      name: "Scaling",
      matrix: MatrixUtils.scaling(2, 0.5),
      points: [0, 0, 10, 10, -4, 8, 1, 1, 5, 5], // 5 puntos
    },
    {
      name: "Rotation (PI/2)",
      matrix: MatrixUtils.rotation(Math.PI / 2),
      points: [1, 0, 10, 0, 0, 1, 5, 5], // 4 puntos
    },
    {
      name: "Affine Combination",
      // Usar la misma matriz del benchmark si quieres
      matrix: MatrixUtils.fromValues(1, 0.433, 0, -1.732, 0.25, 0, 10, 5, 1),
      points: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9], // 10 puntos
    },
    {
      name: "Perspective Projection",
      matrix: MatrixUtils.fromValues(1, 0, 0.001, 0, 1, 0.002, 0, 0, 1), // Causa división por W
      points: [0, 0, 10, 10, 100, 50, 500, 200], // 4 puntos
    },
    {
      name: "W close to Zero (Expect NaN)",
      // Esta matriz y el punto (1,1) harán W = 0*1 + 0*1 + 0 = 0
      matrix: MatrixUtils.fromValues(1, 0, 0, 0, 1, 0, 0, 0, 0),
      points: [1, 1, 2, 3], // 2 puntos (el primero dará NaN)
    },
    {
      name: "Empty Input",
      matrix: MatrixUtils.identity(),
      points: [], // 0 puntos
    },
    {
      name: "One Point",
      matrix: MatrixUtils.translation(1, 1),
      points: [5, 5], // 1 punto
    },
    {
      name: "Three Points",
      matrix: MatrixUtils.scaling(2, 2),
      points: [1, 1, 2, 2, 3, 3], // 3 puntos
    },
  ];

  testCases.forEach((tc) => {
    it(`should produce correct results for: ${tc.name}`, async () => {
      const pointsIn = new Float32Array(tc.points);

      // Calcular resultado de referencia con JS
      const expectedOutput = transformPointsBatchJS(tc.matrix, pointsIn);

      // Calcular resultado con WASM
      const wasmOutput = await transformPointsBatchWasm_Copy(
        tc.matrix,
        pointsIn
      );

      // Comparar los arrays completos
      // Usar una tolerancia adecuada para punto flotante
      expectFloatArrayCloseTo(wasmOutput, expectedOutput, 1e-5);
    });
  });
});
