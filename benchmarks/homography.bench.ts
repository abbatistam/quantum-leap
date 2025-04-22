// benchmarks/homography.bench.ts
import { performance } from "perf_hooks";
import { PerspectiveCommand } from "../src/core/commands/PerspectiveCommand"; // Ajusta ruta
import { MatrixUtils } from "../src/core/matrix/MatrixUtils"; // Ajusta ruta
import {
  solveHomographySvdWasm,
  cleanupWasm,
  loadWasmModule, // Para asegurar carga inicial y acceso a MatrixUtils async
} from "../src/core/wasm/wasm-loader"; // Ajusta ruta
import type { Matrix3x3, Point } from "../src/types/core.types"; // Ajusta ruta
import { MatrixError } from "../src/types/errors.model";
import { isValidNumber, isValidPoint } from "../src/utils/utils"; // Asumimos importación

// --- Configuración ---
const NUM_ITERATIONS = 500; // Calcular homografía es más lento
const WARMUP_ITERATIONS = 50;

// --- Datos de Prueba ---
// Puntos no degenerados
const sourcePoints: [Point, Point, Point, Point] = [
  { x: 50, y: 50 },
  { x: 200, y: 50 },
  { x: 200, y: 200 },
  { x: 50, y: 200 },
];
const destPoints: [Point, Point, Point, Point] = [
  { x: 60, y: 60 },
  { x: 190, y: 70 },
  { x: 180, y: 190 },
  { x: 70, y: 180 },
];

// Puntos ligeramente perturbados para variedad
const sourcePointsRand: [Point, Point, Point, Point] = [
  { x: 50 + Math.random() * 5, y: 50 + Math.random() * 5 },
  { x: 200 + Math.random() * 5, y: 50 + Math.random() * 5 },
  { x: 200 + Math.random() * 5, y: 200 + Math.random() * 5 },
  { x: 50 + Math.random() * 5, y: 200 + Math.random() * 5 },
];
const destPointsRand: [Point, Point, Point, Point] = [
  { x: 60 + Math.random() * 5, y: 60 + Math.random() * 5 },
  { x: 190 + Math.random() * 5, y: 70 + Math.random() * 5 },
  { x: 180 + Math.random() * 5, y: 190 + Math.random() * 5 },
  { x: 70 + Math.random() * 5, y: 180 + Math.random() * 5 },
];

const testPointSets = [
    { src: sourcePoints, dst: destPoints },
    { src: sourcePointsRand, dst: destPointsRand }
];

// --- Método 1: Usando PerspectiveCommand.create ---
async function computeHomographyJS(
  src: Readonly<[Point, Point, Point, Point]>,
  dst: Readonly<[Point, Point, Point, Point]>,
): Promise<Matrix3x3 | null> {
  try {
    // La creación ya incluye la computación de la homografía
    const command = await PerspectiveCommand.create(src, dst);
    // Necesitamos acceder a la homografía calculada.
    // PerspectiveCommand no expone públicamente la homografía.
    // Para el benchmark, podríamos:
    // 1. Modificar PerspectiveCommand para tener un getter (menos ideal).
    // 2. Extraer la lógica de 'computeHomography' de PerspectiveCommand aquí. (MEJOR para benchmark)
    // Vamos a extraer/replicar la lógica aquí para medirla directamente.

    // --- Lógica Replicada de PerspectiveCommand.computeHomography ---
    const [normalizedSrc, Tsrc] = normalizePointsHelper(src); // Usar helper abajo
    const [normalizedDst, Tdst] = normalizePointsHelper(dst);

    const A: number[][] = [];
    const b: number[] = [];
    for (let i = 0; i < 4; i++) {
        const { x: xs, y: ys } = normalizedSrc[i];
        const { x: xd, y: yd } = normalizedDst[i];
         if (isNaN(xs) || isNaN(ys) || isNaN(xd) || isNaN(yd)) {
           throw new MatrixError("Invalid normalized points", "INTERNAL_ERROR");
         }
        A.push([xs, ys, 1, 0, 0, 0, -xs * xd, -ys * xd]);
        b.push(xd);
        A.push([0, 0, 0, xs, ys, 1, -xs * yd, -ys * yd]);
        b.push(yd);
    }

    const h = solveLinearHelper(A, b); // Usar helper abajo

    const H_norm = new Float32Array([
        h[0], h[3], h[6], // Col 1
        h[1], h[4], h[7], // Col 2
        h[2], h[5], 1,    // Col 3
    ]) as Matrix3x3;
    // Corrección: Eigen y JS (column-major) vs row-major data order.
    // La construcción de H_norm debe ser consistente con cómo espera las matrices MatrixUtils.
    // Si MatrixUtils usa Float32Array(9) como [m0, m1, m2, m3, m4, m5, m6, m7, m8] (column-major para Eigen?), entonces:
    // H_norm = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]; // Row-major style for filling array? Let's check MatrixUtils.
    // Asumiendo que MatrixUtils internamente maneja Float32Array(9) como column-major (Eigen default):
    // H_norm[0]=h[0], H_norm[1]=h[1], H_norm[2]=h[2],  <- Primera Columna de H
    // H_norm[3]=h[3], H_norm[4]=h[4], H_norm[5]=h[5],  <- Segunda Columna de H
    // H_norm[6]=h[6], H_norm[7]=h[7], H_norm[8]=1     <- Tercera Columna de H
    // La forma original H_norm = [h[0], h[3], h[6], h[1], h[4], h[7], h[2], h[5], 1] parece correcta para llenar por filas un array que se interpreta column-major.

    // Denormalize: H = T_dst^-1 * H_norm * T_src
    const T_dst_inv = await MatrixUtils.inverse(Tdst);
    if (!T_dst_inv) throw new MatrixError("Failed to invert Tdst", "SINGULAR_MATRIX");

    const tempMatrix = await MatrixUtils.multiply(T_dst_inv, H_norm);
    const H = await MatrixUtils.multiply(tempMatrix, Tsrc);
    // --- Fin Lógica Replicada ---

    return H; // Devolver la homografía calculada
  } catch (error) {
    // console.error("Error in computeHomographyJS:", error);
    return null; // Devolver null en caso de error para el benchmark
  }
}

// --- Método 2: Usando WASM SVD ---
async function computeHomographyWasmSVD(
  src: Readonly<[Point, Point, Point, Point]>,
  dst: Readonly<[Point, Point, Point, Point]>,
): Promise<Matrix3x3 | null> {
  try {
    // 1. Normalización (igual que antes, JS)
    const [normalizedSrc, Tsrc] = normalizePointsHelper(src);
    const [normalizedDst, Tdst] = normalizePointsHelper(dst);

    // 2. Construir A (64 floats) y b (8 floats) para WASM
    const A_wasm = new Float32Array(64);
    const b_wasm = new Float32Array(8);
    let A_idx = 0;
    let b_idx = 0;
    for (let i = 0; i < 4; i++) {
      const { x: xs, y: ys } = normalizedSrc[i];
      const { x: xd, y: yd } = normalizedDst[i];
       if (isNaN(xs) || isNaN(ys) || isNaN(xd) || isNaN(yd)) {
           throw new MatrixError("Invalid normalized points", "INTERNAL_ERROR");
         }

      // Fila 1: [xs, ys, 1,  0,  0,  0, -xs*xd, -ys*xd] -> b[0] = xd
      A_wasm[A_idx++] = xs; A_wasm[A_idx++] = 0;  A_wasm[A_idx++] = -xs * xd;
      A_wasm[A_idx++] = ys; A_wasm[A_idx++] = 0;  A_wasm[A_idx++] = -ys * xd;
      A_wasm[A_idx++] = 1;  A_wasm[A_idx++] = 0;
      A_wasm[A_idx++] = 0;  A_wasm[A_idx++] = xs; A_wasm[A_idx++] = -xs * yd; // <-- Error aquí, debe ser para la siguiente fila
      A_wasm[A_idx++] = 0;  A_wasm[A_idx++] = ys; A_wasm[A_idx++] = -ys * yd; // <-- Error aquí
      A_wasm[A_idx++] = 0;  A_wasm[A_idx++] = 1;
      // ... esta forma de llenar es incorrecta para una matriz columna-major 8x8
      // Reintentar llenado para WASM (asumiendo A es 8x8 column-major)
      // Fila 1: [xs, ys, 1,  0,  0,  0, -xs*xd, -ys*xd]
      // Fila 2: [ 0,  0,  0, xs, ys,  1, -xs*yd, -ys*yd]
      // ... repetir para i = 0..3

      // Reset index para llenado correcto
      A_idx = i * 2; // Índice de fila inicial para este punto

      // Escribir las dos filas correspondientes a este punto 'i'
      // Fila 1 (elementos pares en A_wasm si A fuera row-major, o elementos de 2 cols en col-major)
      A_wasm[0 * 8 + A_idx] = xs;       // A(0, 2i)
      A_wasm[1 * 8 + A_idx] = ys;       // A(1, 2i)
      A_wasm[2 * 8 + A_idx] = 1;        // A(2, 2i)
      A_wasm[3 * 8 + A_idx] = 0;        // A(3, 2i)
      A_wasm[4 * 8 + A_idx] = 0;        // A(4, 2i)
      A_wasm[5 * 8 + A_idx] = 0;        // A(5, 2i)
      A_wasm[6 * 8 + A_idx] = -xs * xd; // A(6, 2i)
      A_wasm[7 * 8 + A_idx] = -ys * xd; // A(7, 2i)
      b_wasm[b_idx++] = xd;             // b(2i)

      // Fila 2 (elementos impares en A_wasm si fuera row-major, o elementos de 2 cols en col-major)
      A_idx++; // Siguiente índice de fila
      A_wasm[0 * 8 + A_idx] = 0;        // A(0, 2i+1)
      A_wasm[1 * 8 + A_idx] = 0;        // A(1, 2i+1)
      A_wasm[2 * 8 + A_idx] = 0;        // A(2, 2i+1)
      A_wasm[3 * 8 + A_idx] = xs;       // A(3, 2i+1)
      A_wasm[4 * 8 + A_idx] = ys;       // A(4, 2i+1)
      A_wasm[5 * 8 + A_idx] = 1;        // A(5, 2i+1)
      A_wasm[6 * 8 + A_idx] = -xs * yd; // A(6, 2i+1)
      A_wasm[7 * 8 + A_idx] = -ys * yd; // A(7, 2i+1)
      b_wasm[b_idx++] = yd;             // b(2i+1)
    }
     // El llenado anterior es para **Column-Major** (Eigen default)
     // A_wasm[col * numRows + row] = value

    // 3. Resolver usando WASM SVD
    const h_wasm = await solveHomographySvdWasm(A_wasm, b_wasm);
    if (!h_wasm) {
      throw new MatrixError("WASM SVD failed to solve", "SINGULAR_MATRIX");
    }

    // 4. Reconstruir H_norm (asumiendo h_wasm es [h0, h1, ..., h7])
    const H_norm = new Float32Array([
      h_wasm[0], h_wasm[3], h_wasm[6], // Col 1 - Error, should be row major fill for col major matrix
      h_wasm[1], h_wasm[4], h_wasm[7], // Col 2
      h_wasm[2], h_wasm[5], 1,         // Col 3
    ]) as Matrix3x3;
     // Re-verificar llenado H_norm desde h=[h0..h7] para col-major H=[m0..m8]
     // H = [[h0, h3, h6],
     //      [h1, h4, h7],
     //      [h2, h5, 1 ]]
     // Array col-major: [H(0,0), H(1,0), H(2,0), H(0,1), H(1,1), H(2,1), H(0,2), H(1,2), H(2,2)]
     // Array col-major: [h0, h1, h2, h3, h4, h5, h6, h7, 1]
     H_norm.set([
         h_wasm[0], h_wasm[1], h_wasm[2], // Col 0
         h_wasm[3], h_wasm[4], h_wasm[5], // Col 1
         h_wasm[6], h_wasm[7], 1         // Col 2
     ]);


    // 5. Desnormalización (igual que antes, JS + MatrixUtils async)
    const T_dst_inv = await MatrixUtils.inverse(Tdst);
    if (!T_dst_inv) throw new MatrixError("Failed to invert Tdst", "SINGULAR_MATRIX");

    const tempMatrix = await MatrixUtils.multiply(T_dst_inv, H_norm);
    const H = await MatrixUtils.multiply(tempMatrix, Tsrc);

    return H;
  } catch (error) {
    // console.error("Error in computeHomographyWasmSVD:", error);
    return null; // Devolver null en caso de error
  }
}

// --- Helpers Replicados/Adaptados de PerspectiveCommand ---
// (Necesario porque computeHomography es privado y lo estamos llamando fuera)
// NOTA: Idealmente, estos helpers estarían en MatrixUtils o serían estáticos públicos.

const HELPER_EPSILON = 1e-9; // Usar un epsilon consistente

function normalizePointsHelper(points: Readonly<Point[]>): [Point[], Matrix3x3] {
    const numPoints = points.length;
    if (numPoints === 0) return [[], MatrixUtils.identity()]; // Usa MatrixUtils
    let sumX = 0, sumY = 0;
    let validPoints = 0;
    for (const p of points) {
        if (!p || !isValidNumber(p.x) || !isValidNumber(p.y)) continue;
        sumX += p.x;
        sumY += p.y;
        validPoints++;
    }
     if (validPoints === 0) return [[], MatrixUtils.identity()]; // Handle case with no valid points

    const cx = sumX / validPoints;
    const cy = sumY / validPoints;

    let sumDist = 0;
    for (const p of points) {
         if (!p || !isValidNumber(p.x) || !isValidNumber(p.y)) continue;
        const dx = p.x - cx;
        const dy = p.y - cy;
        sumDist += Math.sqrt(dx * dx + dy * dy);
    }
    const avgDist = validPoints > 0 ? sumDist / validPoints : 0;
    // Evitar división por cero o escala infinita si todos los puntos son coincidentes
    const scale = (avgDist > HELPER_EPSILON) ? (Math.SQRT2 / avgDist) : 1.0;

    // Crear matriz T (asegúrate que el formato es el esperado por MatrixUtils)
    // Asumiendo Float32Array(9) column-major [m0,m1,m2, m3,m4,m5, m6,m7,m8]
    // T = [[scale, 0, -scale*cx], [0, scale, -scale*cy], [0, 0, 1]]
     const T = new Float32Array([
        scale, 0, 0,             // Col 0
        0, scale, 0,             // Col 1
        -scale * cx, -scale * cy, 1 // Col 2
     ]) as Matrix3x3;


    const normPoints: Point[] = points.map(p => {
        if (!p || !isValidNumber(p.x) || !isValidNumber(p.y)) return { x: NaN, y: NaN }; // Keep invalid points as NaN
        return {
            x: scale * (p.x - cx),
            y: scale * (p.y - cy)
        };
    });

    return [normPoints, T];
}


function solveLinearHelper(A: number[][], b: number[]): number[] {
    // --- Lógica Replicada de PerspectiveCommand.solveLinear ---
     const n = b.length;
     // Basic validation (can be enhanced)
    if (!A || A.length !== n || !b || b.length !== n) {
        throw new MatrixError("Invalid dimensions for solveLinearHelper", "INTERNAL_ERROR");
    }

     // Crear copia para no modificar original (aunque A es local aquí)
     const M: number[][] = A.map((row, i) => [...row, b[i]]);

     // Eliminación Gaussiana con Pivoteo Parcial
     for (let k = 0; k < n; k++) {
         // Encontrar pivote
         let iMax = k;
         let maxVal = Math.abs(M[k][k]);
         for (let i = k + 1; i < n; i++) {
             const absVal = Math.abs(M[i][k]);
             if (absVal > maxVal) {
                 maxVal = absVal;
                 iMax = i;
             }
         }

         // Chequear singularidad
         if (maxVal < HELPER_EPSILON) {
             throw new MatrixError(`Singular matrix detected (pivot near zero at step ${k})`, "SINGULAR_MATRIX");
         }

         // Intercambiar filas si es necesario
         if (iMax !== k) {
             [M[k], M[iMax]] = [M[iMax], M[k]];
         }

         // Eliminación
         const pivot = M[k][k];
         for (let i = k + 1; i < n; i++) {
             const factor = M[i][k] / pivot;
             M[i][k] = 0; // Establecer explícitamente a 0
             for (let j = k + 1; j <= n; j++) { // Incluir columna b
                 const term = factor * M[k][j];
                 // Check for NaN/Infinity during calculation
                 if (!isValidNumber(M[i][j]) || !isValidNumber(term)) {
                      throw new MatrixError(`Numerical instability during forward elimination at M[${i}][${j}]`, "SINGULAR_MATRIX");
                 }
                 M[i][j] -= term;
             }
         }
     }

     // Sustitución hacia atrás
     const x = new Array(n).fill(0.0);
     for (let i = n - 1; i >= 0; i--) {
         let sum = M[i][n]; // Última columna (vector b modificado)
         for (let j = i + 1; j < n; j++) {
              const term = M[i][j] * x[j];
                if (!isValidNumber(sum) || !isValidNumber(term)) {
                     throw new MatrixError(`Numerical instability during back substitution sum at x[${i}]`, "SINGULAR_MATRIX");
                 }
             sum -= term;
         }

         const divisor = M[i][i];
         if (Math.abs(divisor) < HELPER_EPSILON) {
              throw new MatrixError(`Numerical instability during back substitution division at step ${i}`, "SINGULAR_MATRIX");
         }
          if (!isValidNumber(sum)) {
              throw new MatrixError(`Numerical instability (NaN/Inf) before division at x[${i}]`, "SINGULAR_MATRIX");
         }

         x[i] = sum / divisor;

           if (!isValidNumber(x[i])) {
              throw new MatrixError(`Numerical instability (NaN/Inf result) at x[${i}]`, "SINGULAR_MATRIX");
         }
     }
     return x;
    // --- Fin Lógica Replicada ---
}


// --- Función Genérica de Benchmark (Adaptada) ---
async function runHomographyBenchmark(
  computeFn: (
      src: Readonly<[Point, Point, Point, Point]>,
      dst: Readonly<[Point, Point, Point, Point]>
    ) => Promise<Matrix3x3 | null>,
  name: string,
  numIterations: number,
  pointSets: {src: [Point, Point, Point, Point], dst: [Point, Point, Point, Point]}[]
) {
  console.log(`\n--- Running Benchmark: ${name} ---`);
  let validResults = 0;
  let errorCount = 0;
  const warmupIterations = Math.max(1, WARMUP_ITERATIONS);

  // Warmup
  console.log(`  Warming up (${warmupIterations} iterations)...`);
  for (let i = 0; i < warmupIterations; i++) {
      const points = pointSets[i % pointSets.length];
      try {
        await computeFn(points.src, points.dst);
      } catch(e) { /* ignore errors in warmup */ }
  }

  // Cargar/Asegurar módulo WASM justo antes de medir si es necesario
  console.log("  Ensuring WASM module is ready...");
  await loadWasmModule(); // Asegura que esté cargado para ambas funciones
  console.log("  WASM module ready.");


  // Medición
  console.log(`  Measuring (${numIterations} iterations)...`);
  const startTime = performance.now();
  for (let i = 0; i < numIterations; i++) {
       const points = pointSets[i % pointSets.length];
       try {
           const result = await computeFn(points.src, points.dst);
           if (result) {
               validResults++;
           } else {
               errorCount++; // Count null returns as errors for this benchmark
           }
       } catch (e) {
           errorCount++;
            if (errorCount < 5) {
               console.error(`   Error during measurement in ${name}:`, e instanceof Error ? e.message : e);
           } else if (errorCount === 5) {
               console.error(`   (Further measurement errors suppressed)`);
           }
       }
  }
  const endTime = performance.now();
  const duration = endTime - startTime;

  console.log(`  Valid results: ${validResults}, Errors/Nulls: ${errorCount}`);
  console.log(`  Total Time: ${duration.toFixed(2)} ms`);
  console.log(
    `  Avg Time per op: ${(duration / numIterations).toFixed(4)} ms`,
  );
  return duration;
}

// --- Ejecución Principal ---
async function main() {
  console.log(`Starting Homography Computation Benchmarks (${NUM_ITERATIONS} iterations)...`);

  const jsTime = await runHomographyBenchmark(
      computeHomographyJS,
      "JS Solve + Utils",
      NUM_ITERATIONS,
      testPointSets
  );

  const wasmSvdTime = await runHomographyBenchmark(
      computeHomographyWasmSVD,
      "WASM SVD Solve + Utils",
      NUM_ITERATIONS,
      testPointSets
  );

  // --- Resumen ---
  console.log("\n--- Benchmark Summary ---");
  console.log(`JS Solve Time:    ${jsTime.toFixed(2)} ms`);
  console.log(`WASM SVD Solve Time: ${wasmSvdTime.toFixed(2)} ms`);

  if (jsTime > 0 && wasmSvdTime > 0) {
    const diff = jsTime - wasmSvdTime;
    const perc = (diff / jsTime) * 100;
    if (diff > 0) {
      console.log(
        `=> WASM SVD was ${diff.toFixed(2)} ms (${perc.toFixed(1)}%) faster.`,
      );
    } else {
      console.log(
        `=> JS Solve was ${Math.abs(diff).toFixed(2)} ms (${Math.abs(perc).toFixed(1)}%) faster.`,
      );
    }
  }

  // Limpiar memoria WASM al final
  cleanupWasm();
}

main().catch((error) => {
  console.error("\nBenchmark failed:", error);
  cleanupWasm(); // Intentar limpiar incluso si falla
  process.exit(1);
});