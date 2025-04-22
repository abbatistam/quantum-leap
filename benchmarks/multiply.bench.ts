// benchmarks/multiply.bench.ts
import { performance } from 'perf_hooks';
import { MatrixUtils } from '../src/core/matrix/MatrixUtils'; // Ajusta ruta
import { multiplyWasm, cleanupWasm, loadWasmModule } from '../src/core/wasm/wasm-loader'; // Ajusta ruta
import type { Matrix3x3 } from '../src/types/core.types'; // Ajusta ruta
import { isValidNumber } from '../src/utils/utils'; // Importar si es necesario

// --- Configuración ---
const NUM_ITERATIONS = 100000; // Número alto, la multiplicación es rápida
const WARMUP_ITERATIONS = NUM_ITERATIONS / 10;

// --- Funciones a Probar ---

// Versión JS (Usando multiplyInPlace como base, pero devolviendo nuevo array)
const multiplyJS = (a: Matrix3x3, b: Matrix3x3): Matrix3x3 => {
    const out = MatrixUtils.identity(); // Crear matriz de salida
    try {
        MatrixUtils.multiplyInPlace(a, b, out); // Calcula a * b -> out
    } catch (e) {
        console.error('Error in multiplyInPlace JS:', e);
        MatrixUtils.identityInPlace(out); // Resetear a identidad si falla
    }
    return out;
};

// Versión WASM (Wrapper ya existente)
const multiplyWasmFn = async (a: Matrix3x3, b: Matrix3x3): Promise<Matrix3x3> => {
    return multiplyWasm(a, b);
};

// --- Matrices de Prueba ---
const matrix_identity = MatrixUtils.identity();
const matrix_translation = MatrixUtils.translation(10, 5);
const matrix_scale = MatrixUtils.scaling(2, 0.5);
const matrix_rotation = MatrixUtils.rotation(Math.PI / 3);
const matrix_combined = multiplyJS(matrix_translation, multiplyJS(matrix_scale, matrix_rotation)); // T * S * R

// --- CORRECCIÓN AQUÍ ---
const randomValues1 = Array(9)
    .fill(0)
    .map(() => Math.random());
const matrix_random1 = MatrixUtils.fromValues(
    randomValues1[0],
    randomValues1[1],
    randomValues1[2],
    randomValues1[3],
    randomValues1[4],
    randomValues1[5],
    randomValues1[6],
    randomValues1[7],
    randomValues1[8],
);
// O: const matrix_random1 = MatrixUtils.fromValues(...randomValues1 as [number, number, number, number, number, number, number, number, number]);

const randomValues2 = Array(9)
    .fill(0)
    .map(() => Math.random());
const matrix_random2 = MatrixUtils.fromValues(
    randomValues2[0],
    randomValues2[1],
    randomValues2[2],
    randomValues2[3],
    randomValues2[4],
    randomValues2[5],
    randomValues2[6],
    randomValues2[7],
    randomValues2[8],
);
// O: const matrix_random2 = MatrixUtils.fromValues(...randomValues2 as [number, number, number, number, number, number, number, number, number]);
// --- FIN CORRECCIÓN ---

const testMatrices: Matrix3x3[] = [
    matrix_identity,
    matrix_translation,
    matrix_scale,
    matrix_rotation,
    matrix_combined,
    matrix_random1,
    matrix_random2,
];

// --- Función Genérica de Benchmark (Adaptada) ---
async function runBenchmark<T extends any[], R>(
    fn: (...args: T) => Promise<R> | R,
    name: string,
    numIterations: number,
    getData: () => T, // Función que provee los argumentos para cada iteración
    isAsync: boolean,
): Promise<{ duration: number; resultSum?: number | string }> {
    console.log(`\n--- Running Benchmark: ${name} ---`);
    let resultSum: number = 0;
    const warmupIterations = Math.max(1, Math.floor(numIterations / WARMUP_ITERATIONS));

    // Warmup
    console.log(`  Warming up (${warmupIterations} iterations)...`);
    for (let i = 0; i < warmupIterations; i++) {
        const args = getData();
        try {
            if (isAsync) {
                await (fn as (...args: T) => Promise<R>)(...args);
            } else {
                (fn as (...args: T) => R)(...args);
            }
        } catch (e) {
            /* ignore */
        }
    }

    // Cargar/Asegurar módulo WASM
    if (name.includes('WASM')) {
        console.log('  Ensuring WASM module is ready...');
        await loadWasmModule();
        console.log('  WASM module ready.');
    }

    // Medición
    console.log(`  Measuring (${numIterations} iterations)...`);
    const startTime = performance.now();
    for (let i = 0; i < numIterations; i++) {
        const args = getData();
        let result: R;
        try {
            if (isAsync) {
                result = await (fn as (...args: T) => Promise<R>)(...args);
            } else {
                result = (fn as (...args: T) => R)(...args);
            }
            // Sumar el primer elemento de la matriz resultante
            if (result instanceof Float32Array && result.length > 0 && isValidNumber(result[0])) {
                resultSum += result[0];
            }
        } catch (e) {
            if (i < 5) console.error(`   Error in ${name} iteration ${i}:`, e);
            // Continue benchmark even if some iterations fail
        }
    }
    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`  Result sum/indicator (ignore): ${resultSum.toFixed(2)}`);
    console.log(`  Total Time: ${duration.toFixed(2)} ms`);
    console.log(`  Avg Time per op: ${(duration / numIterations).toFixed(6)} ms`);
    return { duration };
}

// --- Ejecución Principal ---
async function main() {
    console.log(`Starting Matrix Multiplication Benchmarks (${NUM_ITERATIONS} iterations)...`);

    const getMatrixPair = (): [Matrix3x3, Matrix3x3] => {
        const idx1 = Math.floor(Math.random() * testMatrices.length);
        const idx2 = Math.floor(Math.random() * testMatrices.length);
        return [testMatrices[idx1], testMatrices[idx2]];
    };

    // Ejecutar versión JS
    const jsTime = (
        await runBenchmark(
            multiplyJS,
            'JS Multiply',
            NUM_ITERATIONS,
            getMatrixPair,
            false, // JS es síncrona
        )
    ).duration;

    // Ejecutar versión WASM
    const wasmTime = (
        await runBenchmark(
            multiplyWasmFn,
            'WASM Multiply',
            NUM_ITERATIONS,
            getMatrixPair,
            true, // WASM es asíncrona
        )
    ).duration;

    // --- Resumen ---
    console.log('\n--- Benchmark Summary (Multiply) ---');
    console.log(`JS Time:   ${jsTime.toFixed(2)} ms`);
    console.log(`WASM Time: ${wasmTime.toFixed(2)} ms`);
    if (jsTime > 0 && wasmTime > 0) {
        const diff = jsTime - wasmTime;
        const perc = (diff / jsTime) * 100;
        if (diff > 0) {
            console.log(`=> WASM was ${diff.toFixed(2)} ms (${perc.toFixed(1)}%) faster.`);
        } else {
            console.log(
                `=> JS was ${Math.abs(diff).toFixed(2)} ms (${Math.abs(perc).toFixed(1)}%) faster.`,
            );
        }
    }

    cleanupWasm();
}

main().catch((error) => {
    console.error('Benchmark failed:', error);
    cleanupWasm();
    process.exit(1);
});
