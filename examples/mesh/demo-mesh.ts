// demo-mesh-compare.ts
import { MatrixUtils } from "../../src/core/matrix/MatrixUtils"; // Ajusta ruta
import {
  WasmBufferManager,
  ManagedWasmBuffer,
} from "../../src/core/wasm/WasmBufferManager"; // Ajusta ruta
import { cleanupWasm } from "../../src/core/wasm/wasm-loader"; // Ajusta ruta
import type { Matrix3x3, Point } from "../../src/types/core.types"; // Ajusta ruta
import { isValidNumber } from "../../src/utils/utils"; // Asegúrate que utils sea accesible

// --- Configuración ---
const INITIAL_MESH_TYPE = "grid100"; // Malla inicial por defecto (10k Vértices)
const CANVAS_WIDTH = 450; // Ancho para cada canvas
const CANVAS_HEIGHT = 400; // Alto
const MESH_COLOR_JS = "rgba(255, 100, 100, 0.8)"; // Rojo pálido para JS
const MESH_COLOR_WASM = "rgba(100, 255, 100, 0.8)"; // Verde pálido para WASM
const MESH_LINE_WIDTH = 1;
const FRAME_TIME_SAMPLE_SIZE = 30; // Número de frames para promediar tiempos

// --- Elementos del DOM ---
const jsCanvas = document.getElementById(
  "jsCanvas"
) as HTMLCanvasElement | null;
const wasmCanvas = document.getElementById(
  "wasmCanvas"
) as HTMLCanvasElement | null;
const jsCtx = jsCanvas?.getContext("2d", { alpha: false });
const wasmCtx = wasmCanvas?.getContext("2d", { alpha: false });
const meshSelect = document.getElementById(
  "meshSelect"
) as HTMLSelectElement | null;
const resetButton = document.getElementById(
  "resetButton"
) as HTMLButtonElement | null;
const statusEl = document.getElementById("status") as HTMLSpanElement | null;
const jsTimeEl = document.getElementById("jsTime") as HTMLSpanElement | null;
const wasmTimeEl = document.getElementById(
  "wasmTime"
) as HTMLSpanElement | null;
const speedupEl = document.getElementById("speedup") as HTMLSpanElement | null;
const vertexCountEl = document.getElementById(
  "vertexCount"
) as HTMLSpanElement | null; // Span para contar vértices en HTML

// Verificar elementos esenciales al inicio
if (
  !jsCanvas ||
  !wasmCanvas ||
  !jsCtx ||
  !wasmCtx ||
  !meshSelect ||
  !resetButton ||
  !statusEl ||
  !jsTimeEl ||
  !wasmTimeEl ||
  !speedupEl /*|| !vertexCountEl*/
) {
  const missingElement = !jsCanvas
    ? "jsCanvas"
    : !wasmCanvas
      ? "wasmCanvas"
      : !jsCtx
        ? "jsCtx"
        : !wasmCtx
          ? "wasmCtx"
          : "control/info element";
  const errorMsg = `Could not find required HTML element: ${missingElement}`;
  console.error(errorMsg);
  if (statusEl) {
    statusEl.textContent = `Error: ${missingElement} not found!`;
    statusEl.className = "error";
  }
  throw new Error(errorMsg); // Detener ejecución si falta algo esencial
}

// --- Estado ---
let currentMeshType = INITIAL_MESH_TYPE;
// Arrays de Vértices
let originalVertices = new Float32Array(0); // [x1, y1, x2, y2, ...]
let jsTransformedVertices = new Float32Array(0); // Resultado JS para dibujar
let wasmTransformedView: Float32Array | null = null; // Vista al buffer de salida WASM
let meshConnectivity: number[][] = []; // Pares de índices [[v1, v2], ...]
let numVertices = 0;

// Transformación Automática
let currentMatrix: Matrix3x3 = MatrixUtils.identity();
let angle = 0,
  scale = 1,
  scaleDirection = 0.005;

// WASM
let bufferManager: WasmBufferManager | null = null;
let isWasmReady = false;

// Medición
let jsCalcTimes: number[] = [];
let wasmCalcTimes: number[] = [];
let avgJsCalcTime = 0;
let avgWasmCalcTime = 0;
let animationFrameId: number | null = null;
let lastTimestamp: number = 0;

// --- Función JS (Referencia) ---
/** Transforma vértices usando JS puro */
const transformVerticesJS = (
  matrix: Matrix3x3,
  verticesIn: Float32Array
): Float32Array => {
  const nPoints = verticesIn.length / 2;
  const verticesOut = new Float32Array(nPoints * 2);
  const pIn: Point = { x: 0, y: 0 };
  const pOut: Point = { x: 0, y: 0 };
  for (let i = 0; i < nPoints; i++) {
    const idx = i * 2;
    pIn.x = verticesIn[idx];
    pIn.y = verticesIn[idx + 1];
    try {
      MatrixUtils.transformPoint(matrix, pIn, pOut);
      verticesOut[idx] = pOut.x;
      verticesOut[idx + 1] = pOut.y;
    } catch (e) {
      verticesOut[idx] = NaN;
      verticesOut[idx + 1] = NaN;
    }
  }
  return verticesOut;
};

// --- Funciones ---

/** Actualiza el texto de estado de forma segura */
function setStatus(text: string, isError: boolean = false): void {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.className = isError ? "error" : "";
  } else {
    console.warn("Status element not found, message:", text);
  }
}

/** Genera los vértices y la conectividad para una malla de rejilla */
function generateGridMesh(
  rows: number,
  cols: number,
  width: number,
  height: number
): { vertices: Float32Array; connectivity: number[][] } {
  const numVerts = rows * cols;
  const vertices = new Float32Array(numVerts * 2);
  const connectivity: number[][] = [];
  const startX = (CANVAS_WIDTH - width) / 2;
  const startY = (CANVAS_HEIGHT - height) / 2;
  const stepX = cols > 1 ? width / (cols - 1) : 0;
  const stepY = rows > 1 ? height / (rows - 1) : 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      const idx2 = index * 2;
      vertices[idx2] = startX + c * stepX;
      vertices[idx2 + 1] = startY + r * stepY;
      // Conectar horizontalmente
      if (c < cols - 1) {
        connectivity.push([index, index + 1]);
      }
      // Conectar verticalmente
      if (r < rows - 1) {
        connectivity.push([index, index + cols]);
      }
    }
  }
  return { vertices, connectivity };
}

/** Carga y prepara una nueva malla según el tipo seleccionado */
async function loadMesh(type: string): Promise<void> {
  console.log(`Loading mesh type: ${type}`);
  setStatus("Loading mesh...");
  currentMeshType = type;
  let rows = 10,
    cols = 10;
  const size = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.7;

  // Determinar dimensiones de la rejilla
  switch (type) {
    case "grid10":
      rows = 10;
      cols = 10;
      break;
    case "grid25":
      rows = 25;
      cols = 25;
      break;
    case "grid50":
      rows = 50;
      cols = 50;
      break;
    case "grid100":
      rows = 100;
      cols = 100;
      break;
    case "grid200":
      rows = 200;
      cols = 200;
      break;
    case "grid300":
      rows = 300;
      cols = 300;
      break;
    case "grid400":
      rows = 400;
      cols = 400;
      break;
    default:
      console.warn(`Unknown mesh type: ${type}, defaulting to 10x10`);
      rows = 10;
      cols = 10;
      break;
  }

  // Generar datos de la malla
  const meshData = generateGridMesh(rows, cols, size, size);
  originalVertices = meshData.vertices;
  meshConnectivity = meshData.connectivity;
  numVertices = originalVertices.length / 2;
  // Redimensionar array de salida JS
  jsTransformedVertices = new Float32Array(originalVertices.length);
  wasmTransformedView = null; // Resetear vista WASM

  // Actualizar UI con número de vértices
  if (vertexCountEl) vertexCountEl.textContent = numVertices.toLocaleString();

  // Preparar buffers WASM si está listo
  if (isWasmReady && bufferManager) {
    setStatus("Preparing WASM buffers...");
    const success = await prepareWasmBuffers(numVertices);
    setStatus(success ? "Ready" : "Buffer Error!");
  } else if (!isWasmReady) {
    setStatus("WASM not ready");
  }

  // Resetear transformación y tiempos
  resetTransform(false); // No redibujar aún
  jsCalcTimes = [];
  wasmCalcTimes = [];
  avgJsCalcTime = 0;
  avgWasmCalcTime = 0;
  if (jsTimeEl) jsTimeEl.textContent = "--";
  if (wasmTimeEl) wasmTimeEl.textContent = "--";
  if (speedupEl) speedupEl.textContent = "--";

  // Forzar un redibujo inicial con la nueva malla y transformación identidad
  await applyTransformAndDraw();
}

/** Prepara (obtiene/realoca) buffers WASM para el número de vértices dado */
async function prepareWasmBuffers(count: number): Promise<boolean> {
  if (!bufferManager?.isInitialized()) {
    console.warn("Buffer Manager not ready, cannot prepare buffers.");
    return false;
  }
  // console.log(`Preparing WASM buffers for ${count} vertices...`);
  try {
    // Obtener/Asegurar capacidad de buffers
    await bufferManager.getInputBuffer(count);
    await bufferManager.getOutputBuffer(count);
    // Obtener la vista de salida inicial para estar listos
    wasmTransformedView = bufferManager.getOutputView(count);
    // console.log("WASM buffers ready.");
    return true;
  } catch (error) {
    console.error("Failed to prepare WASM buffers:", error);
    setStatus("WASM Buffer Error", true);
    isWasmReady = false; // Marcar como no listo si falla
    return false;
  }
}

/** Actualiza la matriz de transformación global que se aplica automáticamente */
function updateTransformationMatrix(): void {
  angle += 0.008; // Rotación un poco más rápida
  scale += scaleDirection;
  if (scale > 1.6 || scale < 0.6) scaleDirection *= -1; // Rango de escala
  const center = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  const rotMatrix = MatrixUtils.rotationAround(angle, center);
  const scaleMatrix = MatrixUtils.scalingAround(scale, scale, center);
  // Combinar: Rotar y luego Escalar
  currentMatrix = MatrixUtils.multiply(scaleMatrix, rotMatrix);
}

/** Dibuja la malla en un contexto específico, conectando vértices */
function drawMesh(
  ctx: CanvasRenderingContext2D,
  vertices: Float32Array | null,
  color: string
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!vertices || vertices.length === 0) return; // No dibujar si no hay datos

  ctx.strokeStyle = color;
  ctx.lineWidth = MESH_LINE_WIDTH;
  ctx.beginPath();
  for (const line of meshConnectivity) {
    const idx1 = line[0] * 2;
    const idx2 = line[1] * 2;
    // Verificar límites del array de vértices
    if (idx1 + 1 >= vertices.length || idx2 + 1 >= vertices.length) continue;
    const x1 = vertices[idx1];
    const y1 = vertices[idx1 + 1];
    const x2 = vertices[idx2];
    const y2 = vertices[idx2 + 1];
    // Dibujar solo si ambos puntos son números válidos
    if (
      isValidNumber(x1) &&
      isValidNumber(y1) &&
      isValidNumber(x2) &&
      isValidNumber(y2)
    ) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
  }
  ctx.stroke(); // Dibujar todas las líneas acumuladas
}

/** Calcula y actualiza el promedio móvil de tiempos */
function updateAverageTime(timeArray: number[], newTime: number): number {
  if (!isValidNumber(newTime) || newTime < 0) {
    return timeArray.length > 0
      ? timeArray.reduce((a, b) => a + b, 0) / timeArray.length
      : 0;
  }
  timeArray.push(newTime);
  if (timeArray.length > FRAME_TIME_SAMPLE_SIZE) timeArray.shift();
  return timeArray.length > 0
    ? timeArray.reduce((a, b) => a + b, 0) / timeArray.length
    : 0;
}

/** Aplica la transformación actual a los vértices originales y llama a dibujar */
async function applyTransformAndDraw(): Promise<void> {
  if (!originalVertices || numVertices === 0) return; // No hacer nada si no hay malla

  // Obtener la vista de entrada correcta para el tamaño actual
  const currentInputSubarray = originalVertices.subarray(0, numVertices * 2);

  // --- Ejecución y Medición JS ---
  let jsTime = NaN;
  try {
    const t0 = performance.now();
    jsTransformedVertices = transformVerticesJS(
      currentMatrix,
      currentInputSubarray
    );
    const t1 = performance.now();
    jsTime = t1 - t0;
    // Verificar si la salida tiene la longitud esperada
    if (jsTransformedVertices.length !== numVertices * 2) {
      console.warn("JS output size mismatch!");
      jsTransformedVertices = new Float32Array(numVertices * 2); // Crear uno vacío para evitar errores dibujo
    }
  } catch (e) {
    console.error("JS Error:", e);
    jsTime = NaN;
  }
  avgJsCalcTime = updateAverageTime(jsCalcTimes, jsTime);

  // --- Ejecución y Medición WASM ---
  let wasmTime = NaN;
  let wasmError = false;
  if (isWasmReady && bufferManager) {
    try {
      const t0 = performance.now();
      // Obtener buffer de entrada y copiar datos
      const inputBuffer = await bufferManager.getInputBuffer(numVertices);
      inputBuffer.view.set(currentInputSubarray);

      // Ejecutar WASM
      await bufferManager.transformPointsBatchManaged(
        currentMatrix,
        numVertices
      );

      // Obtener vista de salida actualizada
      wasmTransformedView = bufferManager.getOutputView(numVertices);
      const t1 = performance.now();
      wasmTime = t1 - t0; // Tiempo incluye copia entrada + cálculo WASM
      if (!wasmTransformedView) wasmError = true;
    } catch (e) {
      console.error("WASM Error:", e);
      wasmTime = NaN;
      wasmError = true;
    }
  } else {
    // Si WASM no está listo, aseguramos que el promedio no se calcule incorrectamente
    wasmTime = NaN;
  }
  avgWasmCalcTime = updateAverageTime(wasmCalcTimes, wasmTime);

  // --- Dibujo ---
  if (jsCtx) drawMesh(jsCtx, jsTransformedVertices, MESH_COLOR_JS);
  if (wasmCtx) drawMesh(wasmCtx, wasmTransformedView, MESH_COLOR_WASM);

  // --- Actualizar UI ---
  if (jsTimeEl)
    jsTimeEl.textContent = isNaN(avgJsCalcTime)
      ? "Error"
      : avgJsCalcTime.toFixed(2);
  if (wasmTimeEl)
    wasmTimeEl.textContent = isNaN(avgWasmCalcTime)
      ? isWasmReady
        ? "Error"
        : "--"
      : avgWasmCalcTime.toFixed(2);
  if (speedupEl) {
    if (
      !isNaN(avgJsCalcTime) &&
      !isNaN(avgWasmCalcTime) &&
      avgWasmCalcTime > 1e-6 &&
      avgJsCalcTime > 0
    ) {
      speedupEl.textContent = (avgJsCalcTime / avgWasmCalcTime).toFixed(1);
    } else {
      speedupEl.textContent = "--";
    }
  }
}

/** Bucle principal de animación */
async function animationLoop() {
  // 1. Calcular nueva matriz
  updateTransformationMatrix();
  // 2. Aplicar transformaciones y dibujar
  await applyTransformAndDraw();
  // 3. Solicitar siguiente frame
  animationFrameId = requestAnimationFrame(animationLoop);
}

/** Resetea la transformación y redibuja */
function resetTransform(redraw = true): void {
  currentMatrix = MatrixUtils.identity(); // Resetear matriz principal
  angle = 0;
  scale = 1;
  scaleDirection = 0.005; // Resetear animación
  if (redraw) {
    applyTransformAndDraw(); // Aplicar identidad y redibujar
  }
}

/** Manejador para cambiar la malla seleccionada */
async function handleMeshChange() {
  if (!meshSelect) return;
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId); // Detener animación actual
  animationFrameId = null;
  await loadMesh(meshSelect.value); // Cargar nueva malla (esto llama a applyTransformAndDraw)
  // Reiniciar animación si la carga fue exitosa (o al menos si WASM está lista o no se necesita)
  if (bufferManager?.isInitialized() || !isWasmReady) {
    lastTimestamp = performance.now(); // Resetear tiempo para delta
    animationFrameId = requestAnimationFrame(animationLoop);
  }
}

/** Ajusta el tamaño de los canvas */
function resizeCanvas(): void {
  if (jsCanvas && wasmCanvas) {
    jsCanvas.width = wasmCanvas.width = CANVAS_WIDTH;
    jsCanvas.height = wasmCanvas.height = CANVAS_HEIGHT;
    // Redibujar la malla actual en el nuevo tamaño si ya está cargada
    if (numVertices > 0) applyTransformAndDraw();
  }
}

/** Inicialización Principal */
async function initializeDemo() {
  setStatus("Initializing...");
  resizeCanvas(); // Tamaño inicial

  // Asignar listeners a controles (verificando existencia)
  meshSelect?.addEventListener("change", handleMeshChange);
  resetButton?.addEventListener("click", () => resetTransform(true));

  // Establecer valor inicial del select y contador de vértices (si existen)
  if (meshSelect) meshSelect.value = INITIAL_MESH_TYPE;
  if (vertexCountEl) vertexCountEl.textContent = "..."; // Placeholder inicial

  // Inicializar WASM
  try {
    bufferManager = new WasmBufferManager();
    await bufferManager.initialize();
    isWasmReady = true;
    setStatus("WASM Ready");
  } catch (error) {
    console.error("WASM Initialization failed:", error);
    setStatus("WASM Init FAILED!", true);
    isWasmReady = false;
  }

  // Cargar malla inicial (después de intentar inicializar WASM)
  await loadMesh(INITIAL_MESH_TYPE);

  // Iniciar bucle de animación si todo fue bien (o al menos si JS funciona)
  console.log("Starting animation loop...");
  lastTimestamp = performance.now(); // Inicializar timestamp
  animationFrameId = requestAnimationFrame(animationLoop);
}

// --- Punto de Entrada ---
initializeDemo();

// --- Limpieza ---
window.addEventListener("beforeunload", () => {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  console.log("Attempting WASM cleanup on page unload...");
  bufferManager
    ?.cleanup()
    .catch((e) => console.error("Error cleaning up buffer manager:", e));
  cleanupWasm().catch((e) =>
    console.error("Error during global WASM cleanup:", e)
  );
});
