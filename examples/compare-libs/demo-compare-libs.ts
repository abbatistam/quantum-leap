// examples/compare-libs/demo-compare-libs.ts
import { MatrixUtils } from "../../src/core/matrix/MatrixUtils"; // Ajusta ruta
import { WasmBufferManager } from "../../src/core/wasm/WasmBufferManager"; // Ajusta ruta
import { cleanupWasm } from "../../src/core/wasm/wasm-loader"; // Ajusta ruta
import { AffineTransform } from "../../src/core/matrix/AffineTransform"; // Para crear matriz Three.js
import type { Matrix3x3 } from "../../src/types/core.types";
import * as PIXI from "pixi.js";
import * as THREE from "three";

console.log("Demo Script Initializing...");

// --- Configuración ---
const NUM_ITERATIONS = 100; // Menos iteraciones para no bloquear tanto el navegador
const WARMUP_ITERATIONS = 10;

// --- Elementos DOM ---
const objectCountSelect = document.getElementById(
  "objectCount"
) as HTMLSelectElement | null;
const runButton = document.getElementById(
  "runButton"
) as HTMLButtonElement | null;
const statusEl = document.getElementById("status") as HTMLSpanElement | null;
const wasmTimeEl = document.getElementById(
  "wasmTime"
) as HTMLTableCellElement | null;
const wasmSpeedEl = document.getElementById(
  "wasmSpeed"
) as HTMLTableCellElement | null;
const pixiTimeEl = document.getElementById(
  "pixiTime"
) as HTMLTableCellElement | null;
const pixiSpeedEl = document.getElementById(
  "pixiSpeed"
) as HTMLTableCellElement | null;
const threeTimeEl = document.getElementById(
  "threeTime"
) as HTMLTableCellElement | null;
const threeSpeedEl = document.getElementById(
  "threeSpeed"
) as HTMLTableCellElement | null;
// const jsTimeEl = document.getElementById('jsTime') as HTMLTableCellElement | null;
// const jsSpeedEl = document.getElementById('jsSpeed') as HTMLTableCellElement | null;

if (
  !objectCountSelect ||
  !runButton ||
  !statusEl ||
  !wasmTimeEl ||
  !wasmSpeedEl ||
  !pixiTimeEl ||
  !pixiSpeedEl ||
  !threeTimeEl ||
  !threeSpeedEl
) {
  throw new Error("Required HTML elements not found for benchmark.");
}

// --- Estado ---
let bufferManager: WasmBufferManager | null = null;
let isWasmReady = false;
let isBenchmarking = false;

// --- Funciones Benchmark ---

function setStatus(
  text: string,
  isLoading: boolean = false,
  isError: boolean = false
): void {
  if (statusEl) {
    statusEl.textContent = text;
    if (isError) statusEl.className = "error";
    else if (isLoading) statusEl.className = "loading";
    else statusEl.className = ""; // Clase normal
  } else {
    console.warn("Status element not found, message:", text);
  }
}

/** Genera datos iniciales */
function generateInitialData(count: number): {
  points: Float32Array;
  pixiSprites: PIXI.Sprite[];
  threeMeshes: THREE.Mesh[];
} {
  console.log(`Generating initial data for ${count} objects...`);
  const points = new Float32Array(count * 2);
  const pixiSprites: PIXI.Sprite[] = [];
  const threeMeshes: THREE.Mesh[] = [];

  // Crear geometría y material reusable para Three.js
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  }); // Simple material

  // Crear textura dummy para Pixi (no se usará para renderizar realmente)
  const dummyTexture = PIXI.Texture.WHITE;

  for (let i = 0; i < count; i++) {
    const x = Math.random() * 1000 - 500;
    const y = Math.random() * 1000 - 500;
    const idx = i * 2;
    points[idx] = x;
    points[idx + 1] = y;

    // Pixi Object
    const sprite = new PIXI.Sprite(dummyTexture);
    sprite.position.set(x, y);
    sprite.rotation = 0;
    sprite.scale.set(1, 1);
    pixiSprites.push(sprite);

    // Three.js Object
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    mesh.rotation.z = 0;
    mesh.scale.set(1, 1, 1);
    threeMeshes.push(mesh);
  }
  console.log("Initial data generated.");
  return { points, pixiSprites, threeMeshes };
}

/** Benchmark para Quantum Leap (WASM + Buffers) */
async function benchmarkQuantumLeap(
  manager: WasmBufferManager,
  matrix: Matrix3x3,
  pointsIn: Float32Array,
  numPoints: number
): Promise<number> {
  if (!manager.isInitialized()) throw new Error("WASM Manager not initialized");

  const inputBuffer = await manager.getInputBuffer(numPoints);
  await manager.getOutputBuffer(numPoints); // Ensure output exists

  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    inputBuffer.view.set(pointsIn);
    await manager.transformPointsBatchManaged(matrix, numPoints);
  }

  // Measurement
  const startTime = performance.now();
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    inputBuffer.view.set(pointsIn); // Copy input data
    await manager.transformPointsBatchManaged(matrix, numPoints); // Execute WASM
    // We don't need to read the output view for the benchmark timing
  }
  const endTime = performance.now();
  return (endTime - startTime) / NUM_ITERATIONS; // Return avg time per iteration
}

/** Benchmark para PixiJS (Actualización JS en bucle) */
function benchmarkPixiJS(
  sprites: PIXI.Sprite[],
  matrix: Matrix3x3 // Tu matriz 3x3
): number {
  const numPoints = sprites.length;
  if (numPoints === 0) return 0;

  // Convertir Matrix3x3 a PIXI.Matrix (solo una vez)
  // Pixi Matrix: | a | c | tx|
  //              | b | d | ty|
  //              | 0 | 0 | 1 |
  // Tu Matrix3x3: [m0, m1, m2, m3, m4, m5, m6, m7, m8] (asumo column-major si viene de C++, o row-major?)
  // Asumamos row-major para JS (como WebGL):
  // [ a, b, 0 ]
  // [ c, d, 0 ]
  // [ tx,ty,1 ] -> m[0]=a, m[1]=b, m[3]=c, m[4]=d, m[6]=tx, m[7]=ty
  const pixiMatrix = new PIXI.Matrix(
    matrix[0],
    matrix[1],
    matrix[3],
    matrix[4],
    matrix[6],
    matrix[7]
  );
  const tempPoint = new PIXI.Point(); // Reusable point

  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    for (let j = 0; j < numPoints; j++) {
      // Aplicar matriz al punto (0,0) y poner el resultado en la posición
      // O más simple: asignar directamente a la transformación del sprite
      // (Pixi recalculará internamente)
      // sprites[j].transform.setFromMatrix(pixiMatrix); // Aplica la matriz completa
      // O simular cálculo y asignación de props (puede ser más común en juegos)
      const base_x = 0; // Simular origen local
      const base_y = 0;
      const tx = matrix[0] * base_x + matrix[3] * base_y + matrix[6];
      const ty = matrix[1] * base_x + matrix[4] * base_y + matrix[7];
      sprites[j].position.set(tx, ty);
      sprites[j].rotation = Math.atan2(matrix[1], matrix[0]); // Aprox.
      sprites[j].scale.set(
        Math.hypot(matrix[0], matrix[1]),
        Math.hypot(matrix[3], matrix[4])
      ); // Aprox.
    }
  }

  // Measurement
  const startTime = performance.now();
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    for (let j = 0; j < numPoints; j++) {
      // Usar el mismo método que en warmup
      // sprites[j].transform.setFromMatrix(pixiMatrix);
      const base_x = 0;
      const base_y = 0; // Simular
      const tx = matrix[0] * base_x + matrix[3] * base_y + matrix[6];
      const ty = matrix[1] * base_x + matrix[4] * base_y + matrix[7];
      sprites[j].position.set(tx, ty);
      sprites[j].rotation = Math.atan2(matrix[1], matrix[0]); // Aprox.
      sprites[j].scale.set(
        Math.hypot(matrix[0], matrix[1]),
        Math.hypot(matrix[3], matrix[4])
      ); // Aprox.
    }
  }
  const endTime = performance.now();
  return (endTime - startTime) / NUM_ITERATIONS;
}

/** Benchmark para Three.js (Actualización JS en bucle) */
function benchmarkThreeJS(
  meshes: THREE.Mesh[],
  matrix: Matrix3x3 // Tu matriz 3x3
): number {
  const numPoints = meshes.length;
  if (numPoints === 0) return 0;

  // Convertir Matrix3x3 a THREE.Matrix4 (solo una vez)
  // Three.js usa matrices 4x4 ColMajor, tu 3x3 es probablemente RowMajor si es de JS/WebGL
  // Matriz 3x3 (Row Major):   Matriz 4x4 Three.js (Col Major):
  // [ a, b, 0 ]               [ a, c, 0, tx ]
  // [ c, d, 0 ]               [ b, d, 0, ty ]
  // [ tx,ty,1 ]               [ 0, 0, 1, 0 ]
  //                           [ 0, 0, 0, 1 ]
  // Correcto: ColMajor:
  //                           [ a, b, 0, 0 ]
  //                           [ c, d, 0, 0 ]
  //                           [ 0, 0, 1, 0 ]
  //                           [ tx,ty,0, 1 ] <= Error tipico, Z deberia ser 1
  // Transpuesta y con Z=1:
  //                           [ a, c, 0, 0 ]
  //                           [ b, d, 0, 0 ]
  //                           [ 0, 0, 1, 0 ] <-- Z en 1
  //                           [ tx,ty,0, 1 ] <-- W en 1
  const threeMatrix = new THREE.Matrix4();
  threeMatrix.set(
    matrix[0],
    matrix[3],
    0,
    matrix[6], // Col 1 (a, c, 0, tx) <-- ERROR, set es ROW MAJOR
    matrix[1],
    matrix[4],
    0,
    matrix[7], // Col 2 (b, d, 0, ty) <-- ERROR
    0,
    0,
    1,
    0, // Col 3 (0, 0, 1, 0)
    0,
    0,
    0,
    1 // Col 4 (0, 0, 0, 1)
  );
  // CORRECCIÓN: Three.js Matrix4.set TOMA Row Major order!
  threeMatrix.set(
    matrix[0],
    matrix[3],
    matrix[6],
    0, // Fila 1 (a, c, tx, 0) <-- Error, orden WebGL / Afín
    matrix[1],
    matrix[4],
    matrix[7],
    0, // Fila 2 (b, d, ty, 0) <-- Error
    0,
    0,
    1,
    0, // Fila 3 (0, 0, 1,  0) <-- m[2,5,8] podrían ser != 0,0,1
    0,
    0,
    0,
    1 // Fila 4 (0, 0, 0,  1)
  );
  // CORRECCIÓN 2: Mapeo correcto de tu 3x3 (asumiendo Row Major) a 4x4 Row Major
  threeMatrix.set(
    matrix[0],
    matrix[3],
    0,
    matrix[6], // Fila 1 (a, c, 0, tx) <-- OK si m[2,5,8] = 0,0,1
    matrix[1],
    matrix[4],
    0,
    matrix[7], // Fila 2 (b, d, 0, ty) <-- OK si m[2,5,8] = 0,0,1
    matrix[2],
    matrix[5],
    1,
    matrix[8], // Fila 3 (pX,pY, 1, pZ/W) <-- Incluir perspectiva si existe! Usamos 1 para Z
    0,
    0,
    0,
    1 // Fila 4 (siempre 0,0,0,1 para afín 2D en 3D) <-- Incorrecto, W está en m[8]
  );
  // CORRECCIÓN 3: Mapeo correcto 3x3 (Row Major) a 4x4 (Row Major para Three.js .set)
  // Necesitamos mapear [a,b,pX, c,d,pY, tx,ty,W] a 4x4
  threeMatrix.set(
    matrix[0],
    matrix[3],
    0,
    matrix[6], // Fila 1: a, c, 0, tx
    matrix[1],
    matrix[4],
    0,
    matrix[7], // Fila 2: b, d, 0, ty
    0,
    0,
    1,
    0, // Fila 3: 0, 0, 1, 0  (Asumimos Z no cambia)
    matrix[2],
    matrix[5],
    0,
    matrix[8] // Fila 4: pX, pY, 0, W (Perspectiva va en la última fila)
  );

  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    for (let j = 0; j < numPoints; j++) {
      // Opción 1: Aplicar la matriz completa (más preciso si hay perspectiva/skew)
      meshes[j].matrix.copy(threeMatrix); // Copiar la matriz calculada
      meshes[j].matrixAutoUpdate = false; // IMPORTANTE: Evitar que Three.js la sobreescriba
      // O Opción 2: Establecer propiedades (más común, pero menos preciso con perspectiva)
      // meshes[j].position.set(matrix[6], matrix[7], 0);
      // meshes[j].rotation.z = Math.atan2(matrix[1], matrix[0]); // Aprox
      // meshes[j].scale.set(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[3], matrix[4]), 1); // Aprox
      // meshes[j].updateMatrix(); // Actualizar matriz interna desde props
    }
  }

  // Measurement
  const startTime = performance.now();
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    for (let j = 0; j < numPoints; j++) {
      // Usar el mismo método que en warmup
      meshes[j].matrix.copy(threeMatrix);
      meshes[j].matrixAutoUpdate = false;
      // Opción 2:
      // meshes[j].position.set(matrix[6], matrix[7], 0);
      // meshes[j].rotation.z = Math.atan2(matrix[1], matrix[0]);
      // meshes[j].scale.set(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[3], matrix[4]), 1);
      // meshes[j].updateMatrix();
    }
  }
  const endTime = performance.now();

  // Resetear matrixAutoUpdate para no afectar otros usos potenciales
  for (let j = 0; j < numPoints; j++) {
    meshes[j].matrixAutoUpdate = true;
  }

  return (endTime - startTime) / NUM_ITERATIONS;
}

// --- Ejecución del Benchmark ---
async function runAllBenchmarks() {
  if (isBenchmarking) return;
  isBenchmarking = true;
  if (runButton) runButton.disabled = true;
  setStatus("Initializing...", false);

  // Resetear tabla
  wasmTimeEl!.textContent =
    pixiTimeEl!.textContent =
    threeTimeEl!.textContent =
      "--";
  wasmSpeedEl!.textContent =
    pixiSpeedEl!.textContent =
    threeSpeedEl!.textContent =
      "--";

  try {
    const objectCount = parseInt(objectCountSelect!.value, 10);
    setStatus(
      `Generating data for ${objectCount.toLocaleString()} objects...`,
      false
    );
    await new Promise((resolve) => setTimeout(resolve, 10)); // Permitir refresco UI

    // 1. Generar Datos Base
    const { points, pixiSprites, threeMeshes } =
      generateInitialData(objectCount);

    // 2. Inicializar WASM Manager (si no está listo)
    if (!bufferManager || !bufferManager.isInitialized()) {
      setStatus("Initializing WASM...", true); // 'true' para class 'loading'
      bufferManager = new WasmBufferManager();
      await bufferManager.initialize();
      isWasmReady = true;
    }

    // 3. Crear Matriz de Transformación (ejemplo)
    const transformMatrix = MatrixUtils.multiply(
      MatrixUtils.rotation(Math.PI / 6),
      MatrixUtils.scaling(1.1, 0.9)
    ); // R * S

    // --- Ejecutar Benchmarks ---
    let wasmAvgTime = NaN,
      pixiAvgTime = NaN,
      threeAvgTime = NaN;

    // WASM
    setStatus(`Running WASM bench (${NUM_ITERATIONS} iter)...`, true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    wasmAvgTime = await benchmarkQuantumLeap(
      bufferManager,
      transformMatrix,
      points,
      objectCount
    );
    if (wasmTimeEl) wasmTimeEl.textContent = wasmAvgTime.toFixed(2);

    // PixiJS
    setStatus(`Running PixiJS bench (${NUM_ITERATIONS} iter)...`, true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    pixiAvgTime = benchmarkPixiJS(pixiSprites, transformMatrix);
    if (pixiTimeEl) pixiTimeEl.textContent = pixiAvgTime.toFixed(2);

    // Three.js
    setStatus(`Running Three.js bench (${NUM_ITERATIONS} iter)...`, true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    threeAvgTime = benchmarkThreeJS(threeMeshes, transformMatrix);
    if (threeTimeEl) threeTimeEl.textContent = threeAvgTime.toFixed(2);

    // --- Calcular y Mostrar Speedups (Relativos a WASM) ---
    setStatus("Finished", false);
    if (wasmAvgTime > 1e-9) {
      // Evitar división por cero
      if (wasmSpeedEl) wasmSpeedEl.textContent = "1.0x"; // Base
      if (pixiAvgTime > 0 && pixiSpeedEl)
        pixiSpeedEl.textContent = `${(pixiAvgTime / wasmAvgTime).toFixed(1)}x`;
      if (threeAvgTime > 0 && threeSpeedEl)
        threeSpeedEl.textContent = `${(threeAvgTime / wasmAvgTime).toFixed(1)}x`;
    }
  } catch (error) {
    console.error("Benchmark failed:", error);
    setStatus(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  } finally {
    isBenchmarking = false;
    if (runButton) runButton.disabled = false;
  }
}

// --- Setup Inicial y Event Listeners ---
async function initializePage() {
  if (!runButton || !objectCountSelect) return; // Guard clause

  runButton.addEventListener("click", runAllBenchmarks);
  // Ejecutar una vez al cargar con el valor por defecto
  runAllBenchmarks();

  // Opcional: Ejecutar de nuevo si cambia la selección (podría ser lento)
  // objectCountSelect.addEventListener('change', runAllBenchmarks);
}

// --- Punto de Entrada y Limpieza ---
initializePage();

window.addEventListener("beforeunload", () => {
  console.log("Attempting WASM cleanup on page unload...");
  bufferManager
    ?.cleanup()
    .catch((e) => console.error("Error cleaning up buffer manager:", e));
  cleanupWasm().catch((e) =>
    console.error("Error during global WASM cleanup:", e)
  );
});
