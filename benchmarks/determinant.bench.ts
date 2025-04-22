// benchmarks/determinant.bench.ts
import { performance } from "perf_hooks";
// Importa tanto la clase MatrixUtils como la función JS específica si la tienes separada
import { MatrixUtils } from "../src/core/matrix/MatrixUtils"; // Ajusta ruta
import { determinantWasm, cleanupWasm } from "../src/core/wasm/wasm-loader"; // Ajusta ruta
import type { Matrix3x3 } from "../src/types/core.types"; // Ajusta ruta

// --- Configuración ---
const NUM_ITERATIONS = 100000; // Número de veces que calcularemos el determinante
const WARMUP_ITERATIONS = NUM_ITERATIONS / 10;

// --- Funciones a Probar ---

// Versión JS (asegúrate de tener acceso a ella, puede ser privada o renombrada)
// Si es privada, necesitarás 'as any' para accederla o hacerla pública/estática temporalmente.
// Aquí asumimos que existe una versión JS accesible, quizás la mantenemos en MatrixUtils.
const determinantJS = (m: Matrix3x3): number => {
  // Copia aquí la lógica SÍNCRONA del determinante JS si no es accesible directamente
  if (!(m instanceof Float32Array && m.length === 9)) {
    throw new Error("Invalid matrix for JS determinant");
  }
  const a = m[0],
    b = m[1],
    c = m[2],
    d = m[3],
    e = m[4],
    f = m[5],
    g = m[6],
    h = m[7],
    i = m[8];
  return a * (e * i - h * f) - d * (b * i - h * c) + g * (b * f - e * c);
};

// Versión WASM (ya la tenemos en MatrixUtils o directamente del loader)
const determinantWasmFn = async (m: Matrix3x3): Promise<number> => {
  // Usa la función exportada desde MatrixUtils si ya la integraste
  // return MatrixUtils.determinant(m);
  // O llama directamente al wrapper para aislar la medición
  return determinantWasm(m);
};

// --- Matrices de Prueba ---
const matrix_identity = MatrixUtils.identity();
const matrix_translation = MatrixUtils.translation(10, 5);
const matrix_scale = MatrixUtils.scaling(2, 0.5);
const matrix_rotation = MatrixUtils.rotation(Math.PI / 3);
const matrix_combined = MatrixUtils.clone(matrix_rotation); // Clonar para no modificarla
MatrixUtils.multiplyInPlace(matrix_scale, matrix_combined, matrix_combined); // S * R
MatrixUtils.multiplyInPlace(
  matrix_translation,
  matrix_combined,
  matrix_combined,
); // T * S * R

const testMatrices: Matrix3x3[] = [
  matrix_identity,
  matrix_translation,
  matrix_scale,
  matrix_rotation,
  matrix_combined,
  // Añade más matrices si quieres (ej. no afín)
  new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) as Matrix3x3,
];

// --- Función de Benchmark ---
async function runDeterminantBenchmark(
  fn: (m: Matrix3x3) => Promise<number> | number,
  name: string,
  isAsync: boolean,
) {
  console.log(`\n--- Running Benchmark: ${name} ---`);
  let warmupDetSum = 0;
  let detSum = 0; // Para evitar que se optimice el bucle

  // Warmup
  console.log(`  Warming up (${WARMUP_ITERATIONS} iterations)...`);
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    const matrix = testMatrices[i % testMatrices.length];
    if (isAsync) {
      warmupDetSum += await (fn as (m: Matrix3x3) => Promise<number>)(matrix);
    } else {
      warmupDetSum += (fn as (m: Matrix3x3) => number)(matrix);
    }
  }
  // Cargar módulo WASM explícitamente antes de medir si es WASM
  if (name.includes("WASM")) {
    console.log("  Pre-loading WASM module...");
    await determinantWasmFn(matrix_identity); // Llama una vez para asegurar carga
    console.log("  WASM module loaded.");
  }

  // Medición
  console.log(`  Measuring (${NUM_ITERATIONS} iterations)...`);
  const startTime = performance.now();
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    const matrix = testMatrices[i % testMatrices.length];
    if (isAsync) {
      detSum += await (fn as (m: Matrix3x3) => Promise<number>)(matrix);
    } else {
      detSum += (fn as (m: Matrix3x3) => number)(matrix);
    }
  }
  const endTime = performance.now();
  const duration = endTime - startTime;

  console.log(`  Result (ignore): ${detSum.toFixed(2)}`); // Muestra para verificar que corrió
  console.log(`  Total Time: ${duration.toFixed(2)} ms`);
  console.log(
    `  Avg Time per op: ${(duration / NUM_ITERATIONS).toFixed(6)} ms`,
  );
  return duration;
}

// --- Ejecución ---
async function main() {
  console.log(
    `Starting Determinant Benchmarks (${NUM_ITERATIONS} iterations each)...`,
  );

  // Ejecutar versión JS
  const jsTime = await runDeterminantBenchmark(
    determinantJS,
    "JS Determinant",
    false,
  );

  // Ejecutar versión WASM
  const wasmTime = await runDeterminantBenchmark(
    determinantWasmFn,
    "WASM Determinant",
    true,
  );

  // --- Resultados ---
  console.log("\n--- Benchmark Summary ---");
  console.log(`JS Time:   ${jsTime.toFixed(2)} ms`);
  console.log(`WASM Time: ${wasmTime.toFixed(2)} ms`);

  if (jsTime > 0 && wasmTime > 0) {
    const diff = jsTime - wasmTime;
    const perc = (diff / jsTime) * 100;
    if (diff > 0) {
      console.log(
        `WASM was ${diff.toFixed(2)} ms (${perc.toFixed(1)}%) faster.`,
      );
    } else {
      console.log(
        `JS was ${Math.abs(diff).toFixed(2)} ms (${Math.abs(perc).toFixed(1)}%) faster.`,
      );
    }
  }

  // Limpiar memoria WASM al final
  cleanupWasm();
}

main().catch(console.error);
