// benchmarks/inverse.bench.ts
import { performance } from 'perf_hooks';
import { MatrixUtils } from '../src/core/matrix/MatrixUtils'; // Ajusta ruta
import { inverseWasm, cleanupWasm, loadWasmModule } from '../src/core/wasm/wasm-loader'; // Ajusta ruta
import type { Matrix3x3 } from '../src/types/core.types'; // Ajusta ruta
import { MatrixError } from '../src/types/errors.model'; // Para capturar errores de inversión
import { isValidNumber } from '../src/utils/utils'; // Importar si es necesario

// --- Configuración ---
const NUM_ITERATIONS = 50000; // La inversión es más lenta que la multiplicación
const WARMUP_ITERATIONS = NUM_ITERATIONS / 10;

// --- Funciones a Probar ---

// Versión JS (Implementación directa o usando MatrixUtils si tiene una versión JS)
const invertJS = (m: Matrix3x3): Matrix3x3 | null => {
    // Implementación directa de inversión 3x3 (Cofactor/Determinante)
    const M = m; // Alias corto
    const det = // Calcular determinante JS (copiar lógica o usar helper)
        M[0] * (M[4] * M[8] - M[7] * M[5]) -
        M[3] * (M[1] * M[8] - M[7] * M[2]) +
        M[6] * (M[1] * M[5] - M[4] * M[2]);

    // Usar epsilon consistente (asumiendo acceso estático o valor conocido)
    // Si MatrixUtils.getEpsilon no es accesible aquí, define un epsilon local.
    const epsilon = 1e-9; // O usa MatrixUtils.getEpsilon() si es posible
    if (Math.abs(det) < epsilon) {
        return null; // Singular
    }

    const invDet = 1.0 / det;
    const out = new Float32Array(9) as Matrix3x3;

    // Calcular la matriz adjunta y multiplicar por invDet
    out[0] = (M[4] * M[8] - M[7] * M[5]) * invDet; // C11
    out[1] = (M[7] * M[2] - M[1] * M[8]) * invDet; // C12 -> Adjoint(2,1)
    out[2] = (M[1] * M[5] - M[4] * M[2]) * invDet; // C13 -> Adjoint(3,1)
    out[3] = (M[5] * M[6] - M[3] * M[8]) * invDet; // C21 -> Adjoint(1,2) -- Error en formula original
    out[4] = (M[0] * M[8] - M[6] * M[2]) * invDet; // C22 -> Adjoint(2,2)
    out[5] = (M[2] * M[3] - M[0] * M[5]) * invDet; // C23 -> Adjoint(3,2) -- Error en formula original
    out[6] = (M[3] * M[7] - M[6] * M[4]) * invDet; // C31 -> Adjoint(1,3)
    out[7] = (M[6] * M[1] - M[0] * M[7]) * invDet; // C32 -> Adjoint(2,3)
    out[8] = (M[0] * M[4] - M[3] * M[1]) * invDet; // C33 -> Adjoint(3,3)

    // CORRECCIÓN de índices para la matriz adjunta transpuesta:
    // Inverse(M)[i,j] = Cofactor(M)[j,i] / det(M)
    // out[0] = C11 / det
    // out[1] = C21 / det --> M[7]*M[2] - M[1]*M[8] era C12, necesitamos C21 = M[5]*M[6] - M[3]*M[8] <-- Error aquí, el original era C12
    // out[2] = C31 / det --> M[1]*M[5] - M[4]*M[2] era C13, necesitamos C31 = M[3]*M[7] - M[6]*M[4] <-- Error aquí
    // out[3] = C12 / det --> M[6]*M[5] - M[3]*M[8] era -C21, necesitamos C12 = M[7]*M[2] - M[1]*M[8] <-- Error aquí
    // out[4] = C22 / det
    // out[5] = C32 / det --> M[3]*M[2] - M[0]*M[5] era -C23, necesitamos C32 = M[6]*M[1] - M[0]*M[7] <-- Error aquí
    // out[6] = C13 / det --> M[3]*M[7] - M[6]*M[4] era C31, necesitamos C13 = M[1]*M[5] - M[4]*M[2] <-- Error aquí
    // out[7] = C23 / det --> M[6]*M[1] - M[0]*M[7] era -C32, necesitamos C23 = M[2]*M[3] - M[0]*M[5] <-- Error aquí
    // out[8] = C33 / det

    // Re-escribir con la fórmula correcta (Adjunta Transpuesta):
    const m0 = M[0],
        m1 = M[1],
        m2 = M[2],
        m3 = M[3],
        m4 = M[4],
        m5 = M[5],
        m6 = M[6],
        m7 = M[7],
        m8 = M[8];
    out[0] = (m4 * m8 - m7 * m5) * invDet;
    out[1] = (m7 * m2 - m1 * m8) * invDet; // Adjoint[1,0] = Cofactor[0,1]
    out[2] = (m1 * m5 - m4 * m2) * invDet; // Adjoint[2,0] = Cofactor[0,2]
    out[3] = (m5 * m6 - m3 * m8) * invDet; // Adjoint[0,1] = Cofactor[1,0]
    out[4] = (m0 * m8 - m6 * m2) * invDet;
    out[5] = (m2 * m3 - m0 * m5) * invDet; // Adjoint[2,1] = Cofactor[1,2]
    out[6] = (m3 * m7 - m6 * m4) * invDet; // Adjoint[0,2] = Cofactor[2,0]
    out[7] = (m6 * m1 - m0 * m7) * invDet; // Adjoint[1,2] = Cofactor[2,1]
    out[8] = (m0 * m4 - m3 * m1) * invDet;

    return out;
};

// Versión WASM (Wrapper ya existente)
const inverseWasmFn = async (m: Matrix3x3): Promise<Matrix3x3 | null> => {
    // Llama directamente al wrapper WASM
    try {
        // inverseWasm devuelve null si C++ retorna 0 (fallo/singular)
        return await inverseWasm(m);
    } catch (e) {
        // Capturar otros errores inesperados de WASM si ocurren
        console.error('Unexpected error in inverseWasmFn:', e);
        return null;
    }
};

// --- Matrices de Prueba ---
const matrix_identity = MatrixUtils.identity();
const matrix_translation = MatrixUtils.translation(10, 5);
const matrix_scale = MatrixUtils.scaling(2, 0.5);
const matrix_rotation = MatrixUtils.rotation(Math.PI / 3);
const matrix_singular = MatrixUtils.fromValues(1, 1, 1, 2, 2, 2, 3, 3, 3); // Matriz singular
// Añadir MatrixUtils.fromValues a MatrixUtils.ts si no existe
const randomValues1 = Array(9)
    .fill(0)
    .map(() => Math.random() * 2 - 1);
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

const randomValues2 = Array(9)
    .fill(0)
    .map(() => Math.random() * 2 - 1);
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

const testMatrices: Matrix3x3[] = [
    matrix_identity,
    matrix_translation,
    matrix_scale,
    matrix_rotation,
    matrix_random1,
    matrix_random2,
    matrix_singular, // Incluir singular para probar manejo de null
];

// --- Función Genérica de Benchmark (Copiada y Corregida) ---
async function runBenchmark<T extends any[], R>(
    fn: (...args: T) => Promise<R> | R,
    name: string,
    numIterations: number, // Usar el parámetro numIterations
    getData: () => T,
    isAsync: boolean,
): Promise<{ duration: number; resultSum?: number | string }> {
    console.log(`\n--- Running Benchmark: ${name} ---`);
    let resultSum: number = 0;
    let nullCount = 0;
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
            // Sumar primer elemento si es una matriz válida
            if (result instanceof Float32Array && result.length > 0) {
                // Asegurarse que no sea NaN antes de sumar
                if (isValidNumber(result[0])) {
                    resultSum += result[0];
                } else {
                    // Podría contar NaNs si la inversa los produce inesperadamente
                    nullCount++;
                }
            } else if (result === null) {
                nullCount++; // Contar matrices singulares/errores
            }
        } catch (e) {
            // Capturar errores lanzados por las funciones (ej. MatrixUtils.inverse)
            if (i < 5) console.error(`   Error in ${name} iteration ${i}:`, e);
            nullCount++;
        }
    }
    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(
        `  Result sum/indicator (ignore): ${resultSum.toFixed(2)} (Nulls/Errors: ${nullCount})`,
    );
    console.log(`  Total Time: ${duration.toFixed(2)} ms`);
    console.log(`  Avg Time per op: ${(duration / numIterations).toFixed(6)} ms`);
    return { duration };
}

// --- Ejecución Principal ---
async function main() {
    console.log(`Starting Matrix Inversion Benchmarks (${NUM_ITERATIONS} iterations)...`);

    const getMatrix = (): [Matrix3x3] => {
        const idx = Math.floor(Math.random() * testMatrices.length);
        return [testMatrices[idx]];
    };

    // Ejecutar versión JS
    const jsTime = (
        await runBenchmark(
            invertJS,
            'JS Invert',
            NUM_ITERATIONS,
            getMatrix,
            false, // JS es síncrona
        )
    ).duration;

    // Ejecutar versión WASM
    const wasmTime = (
        await runBenchmark(
            inverseWasmFn,
            'WASM Invert',
            NUM_ITERATIONS,
            getMatrix,
            true, // WASM es asíncrona
        )
    ).duration;

    // --- Resumen ---
    console.log('\n--- Benchmark Summary (Invert) ---');
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
