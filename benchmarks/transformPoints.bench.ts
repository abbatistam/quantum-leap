// benchmarks/transformPoints.bench.ts
import { performance } from "perf_hooks";
import { MatrixUtils } from "../src/core/matrix/MatrixUtils"; // Ajusta ruta
import {
  WasmBufferManager,
  ManagedWasmBuffer,
} from "../src/core/wasm/WasmBufferManager"; // Ajusta ruta
import { cleanupWasm } from "../src/core/wasm/wasm-loader"; // Ajusta ruta (solo cleanup)
import type { Matrix3x3, Point } from "../src/types/core.types"; // Ajusta ruta
import { isValidNumber } from "../src/utils/utils";

// --- Configuración ---
const NUM_ITERATIONS = 500;
const WARMUP_ITERATIONS_DIV = 10;
const BATCH_SIZES = [1, 10, 100, 1000, 10000, 50000, 100000, 250000, 500000];

// --- Función JS (Referencia - Sin Cambios) ---
const transformPointsBatchJS = (
  matrix: Matrix3x3,
  pointsIn: Float32Array
): Float32Array => {
  const numPoints = pointsIn.length / 2;
  const pointsOut = new Float32Array(numPoints * 2);
  const pIn: Point = { x: 0, y: 0 };
  const pOut: Point = { x: 0, y: 0 };
  for (let i = 0; i < numPoints; i++) {
    const idx = i * 2;
    pIn.x = pointsIn[idx];
    pIn.y = pointsIn[idx + 1];
    try {
      MatrixUtils.transformPoint(matrix, pIn, pOut);
      pointsOut[idx] = pOut.x;
      pointsOut[idx + 1] = pOut.y;
    } catch (e) {
      pointsOut[idx] = NaN;
      pointsOut[idx + 1] = NaN;
    }
  }
  return pointsOut;
};

// --- Datos de Prueba ---
let matrix_combined: Matrix3x3;
// CORRECCIÓN: Quitar async, ya que MatrixUtils.multiply es síncrono
const initializeMatrixCombined = (): void => {
  // <--- Quitado async, añadido :void
  if (matrix_combined) return;
  console.log("[Benchmark Init] Calculating matrix_combined...");
  const perspectiveMatrix = MatrixUtils.fromValues(
    1,
    0,
    0.0001,
    0,
    1,
    0.0002,
    0.01,
    -0.005,
    1.1
  );
  const translationMatrix = MatrixUtils.translation(15, -8);
  const scaleMatrix = MatrixUtils.scaling(1.2, 1.8);
  const rotationMatrix = MatrixUtils.rotation(Math.PI / 5);
  try {
    // Usar MatrixUtils.multiply síncrono
    let tempMatrix = MatrixUtils.multiply(scaleMatrix, rotationMatrix);
    tempMatrix = MatrixUtils.multiply(translationMatrix, tempMatrix);
    matrix_combined = MatrixUtils.multiply(perspectiveMatrix, tempMatrix);
    console.log("[Benchmark Init] matrix_combined calculated.");
  } catch (e) {
    console.error("Failed to initialize matrix_combined:", e);
    matrix_combined = MatrixUtils.identity();
  }
  // No necesita return explícito porque es void
};

const pointsData: { [key: number]: Float32Array } = {};
const maxBatchSize = Math.max(...BATCH_SIZES);
console.log(
  `[Benchmark Init] Generating points up to batch size: ${maxBatchSize}`
);
pointsData[maxBatchSize] = new Float32Array(maxBatchSize * 2);
for (let i = 0; i < maxBatchSize * 2; i++) {
  pointsData[maxBatchSize][i] = Math.random() * 2000 - 1000;
}
for (const size of BATCH_SIZES) {
  if (size !== maxBatchSize)
    pointsData[size] = pointsData[maxBatchSize].subarray(0, size * 2);
}
console.log("[Benchmark Init] Points generated.");

// --- Función Genérica de Benchmark (Corregida Firma calculateResult) ---
async function runBenchmark<T extends any[], R>(
  fn: (...args: T) => Promise<R> | R,
  name: string,
  numIterations: number,
  setup: () => Promise<T | { error: string }> | T | { error: string },
  teardown?: (setupArgs: T) => Promise<void> | void,
  // CORRECCIÓN: Asegurar que la firma del tipo de calculateResult esté completa
  calculateResult?: (result: R, setupArgs: T) => number | string // <--- Asegurar tipo de retorno aquí
): Promise<{ duration: number; resultSum?: number | string }> {
  console.log(`\n--- Running Benchmark: ${name} ---`);
  let setupArgs: T;
  try {
    const setupVal = await setup();
    if (
      typeof setupVal === "object" &&
      setupVal !== null &&
      "error" in setupVal &&
      !(setupVal instanceof Float32Array)
    ) {
      console.error(`   Setup failed for ${name}: ${setupVal.error}`);
      return { duration: -1, resultSum: "Setup Failed" };
    }
    setupArgs = setupVal as T;
  } catch (e) {
    console.error(`   Setup failed for ${name}:`, e);
    return { duration: -1, resultSum: "Setup Failed" };
  }

  let resultAccumulator: number | string = 0;
  let errorCount = 0;
  const isAsync = fn.constructor.name === "AsyncFunction";
  const warmupIterations = Math.max(
    1,
    Math.floor(numIterations / WARMUP_ITERATIONS_DIV)
  );

  // Warmup
  console.log(`  Warming up (${warmupIterations} iterations)...`);
  for (let i = 0; i < warmupIterations; i++) {
    try {
      if (isAsync) {
        await (fn as any)(...setupArgs);
      } else {
        (fn as any)(...setupArgs);
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Medición
  console.log(`  Measuring (${numIterations} iterations)...`);
  const startTime = performance.now();
  for (let i = 0; i < numIterations; i++) {
    let result: R;
    try {
      if (isAsync) {
        result = await (fn as any)(...setupArgs);
      } else {
        result = (fn as any)(...setupArgs);
      }

      if (calculateResult) {
        const currentResult = calculateResult(result, setupArgs);
        if (
          typeof currentResult === "number" &&
          typeof resultAccumulator === "number" &&
          !isNaN(currentResult)
        ) {
          resultAccumulator += currentResult;
        } else if (
          typeof resultAccumulator === "number" &&
          (typeof currentResult !== "number" || isNaN(currentResult as number))
        ) {
          resultAccumulator =
            currentResult === undefined ? "UndefResult" : String(currentResult);
        }
      }
    } catch (e) {
      errorCount++;
      if (i < 5) console.error(`   Error in ${name} iteration ${i}:`, e);
      if (errorCount > numIterations * 0.1)
        resultAccumulator = "Too Many Errors";
    }
  }
  const endTime = performance.now();
  const duration = endTime - startTime;

  // Teardown
  if (teardown) {
    try {
      await teardown(setupArgs);
    } catch (e) {
      console.error(`   Teardown failed for ${name}:`, e);
    }
  }

  // Resultados
  const resultString =
    typeof resultAccumulator === "number"
      ? resultAccumulator.toFixed(2)
      : resultAccumulator;
  console.log(
    `  Result sum/indicator (ignore): ${resultString} (Errors: ${errorCount})`
  );
  console.log(`  Total Time: ${duration.toFixed(2)} ms`);
  console.log(`  Avg Time per op: ${(duration / numIterations).toFixed(6)} ms`);
  return { duration, resultSum: resultAccumulator };
}

// --- Ejecución Principal ---
async function main() {
  // Inicializar matriz (ahora síncrono)
  initializeMatrixCombined(); // <--- Llamada síncrona
  if (!matrix_combined) {
    console.error(
      "Matrix_combined could not be initialized. Aborting benchmark."
    );
    process.exit(1);
  }

  // Inicializar el Gestor de Buffers WASM
  console.log("\nInitializing WASM Buffer Manager...");
  const bufferManager = new WasmBufferManager();
  try {
    await bufferManager.initialize();
    console.log("WASM Buffer Manager initialized.");
  } catch (e) {
    console.error("FATAL: Failed to initialize WASM Buffer Manager.", e);
    process.exit(1);
  }

  console.log(
    `\nStarting Transform Points Batch Benchmarks (${NUM_ITERATIONS} iterations per size)...`
  );
  const results: { [key: number]: { js: number; wasm: number } } = {};

  // Bucle de Benchmarks
  for (const size of BATCH_SIZES) {
    console.log(`\n===== Testing Batch Size: ${size} =====`);
    const points = pointsData[size];
    const numPoints = size;

    // --- Benchmark JS ---
    const jsSetup = (): [Matrix3x3, Float32Array] | { error: string } => [
      matrix_combined,
      points,
    ];
    const jsCalculateResult = (res: Float32Array): number | string =>
      res.length > 0 && isValidNumber(res[0]) ? res[0] : "InvalidResultJS";
    const jsResult = await runBenchmark(
      transformPointsBatchJS,
      `JS Transform Batch (${size})`,
      NUM_ITERATIONS,
      jsSetup,
      undefined,
      jsCalculateResult
    );
    results[size] = { js: jsResult.duration, wasm: -1 };

    // --- Benchmark WASM usando WasmBufferManager ---
    type WasmExecArgs = [WasmBufferManager, Matrix3x3, number];
    const wasmSetup = async (): Promise<WasmExecArgs | { error: string }> => {
      try {
        const inputBuffer = await bufferManager.getInputBuffer(numPoints);
        await bufferManager.getOutputBuffer(numPoints);
        inputBuffer.view.set(points);
        return [bufferManager, matrix_combined, numPoints];
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    };

    const wasmExecutionFn = async (
      manager: WasmBufferManager,
      matrix: Matrix3x3,
      nPoints: number
    ) => {
      await manager.transformPointsBatchManaged(matrix, nPoints);
    };

    // Añadir getter simple a WasmBufferManager para evitar acceso feo
    // (Temporalmente, seguimos con el acceso feo aquí para no modificar WasmBufferManager ahora)
    const wasmCalculateResult = (
      resVoid: void,
      setupArgs: WasmExecArgs
    ): number | string => {
      const manager = setupArgs[0];
      const nPoints = setupArgs[2];
      // Usar el nuevo getter del manager
      const outputView = manager.getOutputView(nPoints);
      if (!outputView) return "Output View Missing!"; // Verificar si se obtuvo

      return outputView.length > 0 && isValidNumber(outputView[0])
        ? outputView[0]
        : "InvalidResultWASM";
    };

    const wasmResult = await runBenchmark<WasmExecArgs, void>(
      wasmExecutionFn,
      `WASM Managed Batch (${size})`,
      NUM_ITERATIONS,
      wasmSetup,
      undefined,
      wasmCalculateResult // Usar la función actualizada
    );
    results[size].wasm = wasmResult.duration;
  } // Fin bucle BATCH_SIZES

  // Liberar buffers gestionados
  console.log("\nCleaning up managed WASM buffers...");
  await bufferManager.cleanup();

  // Resumen
  console.log(
    "\n--- Benchmark Summary (Transform Points Batch - Managed Buffers) ---"
  );
  console.log("Batch Size | JS Time (ms) | WASM Time (ms) | WASM Speedup");
  console.log("-----------|--------------|----------------|-------------");
  for (const size of BATCH_SIZES) {
    const jsT = results[size].js;
    const wasmT = results[size].wasm;
    let speedup = "N/A";
    if (jsT > 0 && wasmT > 0) {
      const factor = jsT / wasmT;
      speedup = `${factor.toFixed(1)}x`;
    } else if (wasmT <= 0) speedup = "FAILED/Inf";
    console.log(
      `${size.toString().padStart(10)} | ${jsT.toFixed(2).padStart(12)} | ${wasmT.toFixed(2).padStart(14)} | ${speedup.padStart(11)}`
    );
  }

  await cleanupWasm(); // Limpieza final estática del loader
}

main().catch((error) => {
  console.error("Benchmark run failed:", error);
  cleanupWasm();
  process.exit(1);
});
