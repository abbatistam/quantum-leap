// demo-compare.ts
import { MatrixUtils } from "../../src/core/matrix/MatrixUtils"; // Ajusta ruta
import {
  WasmBufferManager,
  ManagedWasmBuffer,
} from "../../src/core/wasm/WasmBufferManager"; // Ajusta ruta
import { cleanupWasm } from "../../src/core/wasm/wasm-loader"; // Ajusta ruta
import type { Matrix3x3, Point } from "../../src/types/core.types"; // Ajusta ruta
import { isValidNumber } from "../../src/utils/utils"; // Asegúrate que utils sea accesible

// --- Configuración ---
const INITIAL_PARTICLE_COUNT = 100000;
const MAX_PARTICLE_COUNT = 1000000; // Límite superior del slider
const MAX_POINTS_TO_DRAW = 5000; // Límite visual para mantener rendimiento de dibujo
const CANVAS_WIDTH = 450; // Ancho para cada canvas
const CANVAS_HEIGHT = 400; // Alto
const PARTICLE_COLOR_JS = "rgba(255, 100, 100, 0.7)";
const PARTICLE_COLOR_WASM = "rgba(100, 255, 100, 0.7)";
const PARTICLE_SIZE = 1;
const FRAME_TIME_SAMPLE_SIZE = 30; // Promediar sobre menos frames para ver cambios más rápido

// --- Elementos del DOM ---
// Obtener elementos y verificar existencia
const jsCanvas = document.getElementById(
  "jsCanvas"
) as HTMLCanvasElement | null;
const wasmCanvas = document.getElementById(
  "wasmCanvas"
) as HTMLCanvasElement | null;
const particleCountSlider = document.getElementById(
  "particleCount"
) as HTMLInputElement | null;
const particleCountValue = document.getElementById(
  "particleCountValue"
) as HTMLSpanElement | null;
const movementToggle = document.getElementById(
  "movementToggle"
) as HTMLInputElement | null;
const resetButton = document.getElementById(
  "resetButton"
) as HTMLButtonElement | null;
const statusEl = document.getElementById("status") as HTMLSpanElement | null;
const jsTimeEl = document.getElementById("jsTime") as HTMLSpanElement | null;
const wasmTimeEl = document.getElementById(
  "wasmTime"
) as HTMLSpanElement | null;
const speedupEl = document.getElementById("speedup") as HTMLSpanElement | null;

// Obtener contextos y verificar
const jsCtx = jsCanvas?.getContext("2d", { alpha: false });
const wasmCtx = wasmCanvas?.getContext("2d", { alpha: false });

if (
  !jsCanvas ||
  !wasmCanvas ||
  !jsCtx ||
  !wasmCtx ||
  !particleCountSlider ||
  !particleCountValue ||
  !movementToggle ||
  !resetButton ||
  !statusEl ||
  !jsTimeEl ||
  !wasmTimeEl ||
  !speedupEl
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
  // Intentar mostrar en el status si existe
  if (statusEl) {
    statusEl.textContent = `Error: ${missingElement} not found!`;
    statusEl.className = "error";
  }
  throw new Error(errorMsg); // Detener ejecución si falta algo esencial
}

// --- Estado ---
let particleCount = INITIAL_PARTICLE_COUNT;
// Usar un único array grande para la data original
let baseParticlesX = new Float32Array(MAX_PARTICLE_COUNT);
let baseParticlesY = new Float32Array(MAX_PARTICLE_COUNT);
let baseVelocitiesX = new Float32Array(MAX_PARTICLE_COUNT);
let baseVelocitiesY = new Float32Array(MAX_PARTICLE_COUNT);
// Array intercalado para la entrada de las transformaciones
let pointsJSInput = new Float32Array(MAX_PARTICLE_COUNT * 2);
// Array para guardar la salida de la transformación JS
let pointsJSOutput = new Float32Array(MAX_PARTICLE_COUNT * 2);
// Vista del buffer de salida WASM (se obtiene después de la transformación)
let pointsWASMOutputView: Float32Array | null = null;

let currentMatrix: Matrix3x3 = MatrixUtils.identity();
let angle = 0,
  scale = 1,
  scaleDirection = 0.005;

let bufferManager: WasmBufferManager | null = null;
let isWasmReady = false;
let enableMovement = true;

// Tiempos promedio (para cálculo)
let jsCalcTimes: number[] = [];
let wasmCalcTimes: number[] = [];
let avgJsCalcTime = 0;
let avgWasmCalcTime = 0;
let animationFrameId: number | null = null;
let lastTimestamp: number = 0; // Inicializado en initializeDemo

// --- Función JS (Referencia) ---
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

// --- Funciones Auxiliares ---

/** Actualiza el texto de estado de forma segura */
function setStatus(text: string, isError: boolean = false): void {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.className = isError ? "error" : "";
  } else {
    console.warn("Status element not found, message:", text);
  }
}

/** Inicializa o reinicia las posiciones y velocidades de las partículas */
function initializeParticles(count: number): void {
  console.log(`Initializing ${count} particles...`);
  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;
  // Llenar solo hasta 'count'
  for (let i = 0; i < count; i++) {
    baseParticlesX[i] = Math.random() * w;
    baseParticlesY[i] = Math.random() * h;
    baseVelocitiesX[i] = (Math.random() - 0.5) * 2;
    baseVelocitiesY[i] = (Math.random() - 0.5) * 2;
    const idx2 = i * 2;
    pointsJSInput[idx2] = baseParticlesX[i];
    pointsJSInput[idx2 + 1] = baseParticlesY[i];
  }
  // Limpiar el resto de los arrays si count < MAX_PARTICLE_COUNT
  const inputLength = count * 2;
  if (inputLength < pointsJSInput.length) {
    pointsJSInput.fill(0, inputLength);
  }
  if (count < baseParticlesX.length) {
    baseParticlesX.fill(0, count);
    baseParticlesY.fill(0, count);
    baseVelocitiesX.fill(0, count);
    baseVelocitiesY.fill(0, count);
  }
  // Resetear array de salida JS al tamaño correcto
  pointsJSOutput = new Float32Array(inputLength);
  // Resetear vista WASM
  pointsWASMOutputView = null;
  console.log("Particles initialized.");
}

/** Prepara (obtiene/realoca) buffers WASM para el número de partículas dado */
async function prepareWasmBuffers(count: number): Promise<boolean> {
  if (!bufferManager?.isInitialized()) {
    console.warn("Buffer Manager not ready, cannot prepare buffers.");
    return false;
  }
  console.log(`Preparing WASM buffers for ${count} particles...`);
  try {
    // Obtener buffers asegura capacidad; no necesitamos guardar refs aquí
    await bufferManager.getInputBuffer(count);
    await bufferManager.getOutputBuffer(count);
    // Obtener vista de salida inicial para estar listos
    pointsWASMOutputView = bufferManager.getOutputView(count);
    console.log(`WASM buffers ready for ${count} points.`);
    return true;
  } catch (error) {
    console.error("Failed to prepare WASM buffers:", error);
    setStatus("WASM Buffer Error", true);
    isWasmReady = false;
    return false;
  }
}

/** Actualiza la matriz de transformación global */
function updateTransformationMatrix(): void {
  angle += 0.005;
  scale += scaleDirection;
  if (scale > 1.5 || scale < 0.5) scaleDirection *= -1;
  const center = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  const rotMatrix = MatrixUtils.rotationAround(angle, center);
  const scaleMatrix = MatrixUtils.scalingAround(scale, scale, center);
  currentMatrix = MatrixUtils.multiply(rotMatrix, scaleMatrix);
}

/** Actualiza posiciones basado en velocidad y rebote (escribe en pointsJSInput) */
function updateParticlePositions(count: number, deltaTime: number): void {
  if (!enableMovement || !isValidNumber(deltaTime) || deltaTime <= 0) return;
  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;
  const dtFactor = Math.min(Math.max(deltaTime / 16.66, 0.1), 3);

  for (let i = 0; i < count; i++) {
    let x = baseParticlesX[i] + baseVelocitiesX[i] * dtFactor;
    let y = baseParticlesY[i] + baseVelocitiesY[i] * dtFactor;
    if (x < 0 || x > w) {
      // Fix: use baseVelocitiesX instead of velocitiesX
      baseVelocitiesX[i] *= -1;
      x = Math.max(0, Math.min(w, x));
    }
    if (y < 0 || y > h) {
      // Fix: use baseVelocitiesY instead of velocitiesY
      baseVelocitiesY[i] *= -1;
      y = Math.max(0, Math.min(h, y));
    }
    baseParticlesX[i] = x;
    baseParticlesY[i] = y;
    const idx2 = i * 2;
    pointsJSInput[idx2] = x;
    pointsJSInput[idx2 + 1] = y;
  }
}

/** Dibuja un número limitado de partículas en un contexto específico */
function drawLimitedParticles(
  ctx: CanvasRenderingContext2D,
  count: number, // Número total calculado
  pointsToDraw: Float32Array | null, // Array/vista con los puntos
  color: string
): void {
  // Limpiar siempre el canvas antes de dibujar
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!pointsToDraw) return; // Si no hay datos, dejar limpio

  const countToDraw = Math.min(count, MAX_POINTS_TO_DRAW);
  // Calcular step basado en count (el total calculado), no countToDraw
  const step =
    count > 0 ? Math.max(1, Math.floor(count / MAX_POINTS_TO_DRAW)) : 1;

  ctx.fillStyle = color;
  // Iterar sobre los puntos calculados con el step
  for (let i = 0; i < count; i += step) {
    const idx = i * 2;
    // Verificar límites del array/vista (pointsToDraw puede ser más corto si count < MAX_POINTS...)
    if (idx + 1 >= pointsToDraw.length) break;
    const x = pointsToDraw[idx];
    const y = pointsToDraw[idx + 1];
    if (!isNaN(x) && !isNaN(y)) {
      ctx.fillRect(x, y, PARTICLE_SIZE, PARTICLE_SIZE);
    }
  }
}

/** Calcula y actualiza el promedio móvil de tiempos */
function updateAverageTime(timeArray: number[], newTime: number): number {
  // Ignorar valores inválidos o negativos
  if (!isValidNumber(newTime) || newTime < 0) {
    // Devolver promedio actual o 0 si el array está vacío
    return timeArray.length > 0
      ? timeArray.reduce((a, b) => a + b, 0) / timeArray.length
      : 0;
  }
  timeArray.push(newTime);
  if (timeArray.length > FRAME_TIME_SAMPLE_SIZE) {
    timeArray.shift(); // Mantener tamaño de la ventana de promedio
  }
  // Calcular promedio (asegurarse de no dividir por cero)
  return timeArray.length > 0
    ? timeArray.reduce((a, b) => a + b, 0) / timeArray.length
    : 0;
}

/** Bucle principal de animación */
async function animationLoop() {
  // Usar performance.now() para delta time
  const now = performance.now();
  const deltaTime = now - lastTimestamp;
  lastTimestamp = now;

  // Actualizaciones comunes
  updateTransformationMatrix();
  updateParticlePositions(particleCount, deltaTime);

  // Obtener subarray de entrada para el tamaño actual
  const currentInputSubarray = pointsJSInput.subarray(0, particleCount * 2);

  // --- Ejecución y Medición JS ---
  let jsTime = NaN; // Empezar como NaN
  let jsOutputForDrawing: Float32Array | null = null;
  try {
    const t0 = performance.now();
    jsOutputForDrawing = transformPointsBatchJS(
      currentMatrix,
      currentInputSubarray
    );
    const t1 = performance.now();
    jsTime = t1 - t0;
    // Copiar resultado al array grande de salida JS si es necesario
    if (jsOutputForDrawing && jsOutputForDrawing.length === particleCount * 2) {
      pointsJSOutput.set(jsOutputForDrawing, 0); // Copiar al inicio
    } else if (jsOutputForDrawing) {
      console.warn(
        "JS output size mismatch, expected",
        particleCount * 2,
        "got",
        jsOutputForDrawing.length
      );
    }
  } catch (e) {
    console.error("JS Error:", e);
    jsTime = NaN;
  } // Mantener NaN si hay error
  avgJsCalcTime = updateAverageTime(jsCalcTimes, jsTime);

  // --- Ejecución y Medición WASM ---
  let wasmTime = NaN; // Empezar como NaN
  let wasmError = false;
  if (isWasmReady && bufferManager) {
    try {
      const t0 = performance.now();
      // Obtener buffer de entrada (asegura capacidad) y copiar datos
      const inputBuffer = await bufferManager.getInputBuffer(particleCount);
      inputBuffer.view.set(currentInputSubarray);

      // Ejecutar WASM
      await bufferManager.transformPointsBatchManaged(
        currentMatrix,
        particleCount
      );

      // Obtener vista de salida para leer/dibujar
      pointsWASMOutputView = bufferManager.getOutputView(particleCount);
      const t1 = performance.now();
      wasmTime = t1 - t0; // Tiempo incluye copia entrada + cálculo WASM
      if (!pointsWASMOutputView) wasmError = true;
    } catch (e) {
      console.error("WASM Error:", e);
      wasmTime = NaN;
      wasmError = true;
    }
  }
  avgWasmCalcTime = updateAverageTime(wasmCalcTimes, wasmTime);

  // --- Dibujo (limitado) ---
  if (jsCtx) {
    drawLimitedParticles(
      jsCtx,
      particleCount,
      jsOutputForDrawing,
      PARTICLE_COLOR_JS
    );
  }
  if (wasmCtx) {
    if (wasmError || !isWasmReady || !pointsWASMOutputView) {
      wasmCtx.clearRect(0, 0, wasmCanvas!.width, wasmCanvas!.height); // Limpiar si no hay datos válidos
    } else {
      drawLimitedParticles(
        wasmCtx,
        particleCount,
        pointsWASMOutputView,
        PARTICLE_COLOR_WASM
      );
    }
  }

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
      // Evitar división por cero/inválida
      speedupEl.textContent = (avgJsCalcTime / avgWasmCalcTime).toFixed(1);
    } else {
      speedupEl.textContent = "--";
    }
  }

  // Siguiente frame
  animationFrameId = requestAnimationFrame(animationLoop);
}

/** Manejador para actualizar número de partículas */
async function handleParticleCountChange() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (!particleCountSlider) return; // Early return if null
  const newCount = parseInt(particleCountSlider.value, 10);
  if (!particleCountValue) return; // Early return if null
  particleCountValue.textContent = newCount.toLocaleString();

  // Debounce simple
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (
    !particleCountSlider ||
    parseInt(particleCountSlider.value, 10) !== newCount
  )
    return;

  console.log(`Particle count changed to ${newCount}`);
  particleCount = newCount;
  initializeParticles(particleCount);
  jsCalcTimes = [];
  wasmCalcTimes = [];
  avgJsCalcTime = 0;
  avgWasmCalcTime = 0;

  // Add null checks before accessing properties
  if (jsTimeEl) jsTimeEl.textContent = "--";
  if (wasmTimeEl) wasmTimeEl.textContent = "--";
  if (speedupEl) speedupEl.textContent = "--";

  if (isWasmReady) {
    setStatus("Preparing buffers...");
    const success = await prepareWasmBuffers(particleCount);
    setStatus(success ? "Ready" : "Buffer Error!");
  }

  lastTimestamp = performance.now();
  animationFrameId = requestAnimationFrame(animationLoop);
}

/** Ajusta el tamaño de los canvas */
function resizeCanvas(): void {
  // Asegurarse que los canvas existen
  if (jsCanvas && wasmCanvas) {
    jsCanvas.width = wasmCanvas.width = CANVAS_WIDTH;
    jsCanvas.height = wasmCanvas.height = CANVAS_HEIGHT;
    // Reinicializar partículas para que encajen en el nuevo tamaño
    initializeParticles(particleCount);
  }
}

/** Inicialización Principal */
async function initializeDemo() {
  setStatus("Initializing...");
  resizeCanvas(); // Tamaño inicial

  // Controles (verificar existencia)
  if (particleCountSlider) {
    particleCountSlider.value = INITIAL_PARTICLE_COUNT.toString();
    particleCountSlider.addEventListener("input", () => {
      if (particleCountValue)
        particleCountValue.textContent = parseInt(
          particleCountSlider.value,
          10
        ).toLocaleString();
    });
    particleCountSlider.addEventListener("change", handleParticleCountChange);
  }
  if (particleCountValue)
    particleCountValue.textContent = INITIAL_PARTICLE_COUNT.toLocaleString();
  if (movementToggle) {
    movementToggle.checked = enableMovement;
    movementToggle.addEventListener("change", () => {
      enableMovement = movementToggle.checked;
    });
  }
  if (resetButton)
    resetButton.addEventListener("click", () =>
      initializeParticles(particleCount)
    );

  initializeParticles(particleCount); // Posiciones iniciales

  // Inicializar WASM
  try {
    bufferManager = new WasmBufferManager();
    await bufferManager.initialize();
    isWasmReady = true;
    setStatus("WASM Ready");
    await prepareWasmBuffers(particleCount);
  } catch (error) {
    console.error("WASM Initialization failed:", error);
    setStatus("WASM Init FAILED!", true);
    isWasmReady = false;
  }

  // Iniciar bucle
  lastTimestamp = performance.now(); // Inicializar aquí
  animationFrameId = requestAnimationFrame(animationLoop);
}

// --- Punto de Entrada ---
initializeDemo();

// --- Limpieza ---
window.addEventListener("beforeunload", () => {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  console.log("Attempting WASM cleanup on page unload...");
  // Usar 'async' aquí no garantiza la ejecución completa antes de cerrar,
  // pero es lo mejor que podemos hacer.
  bufferManager
    ?.cleanup()
    .catch((e) => console.error("Error cleaning up buffer manager:", e));
  cleanupWasm().catch((e) =>
    console.error("Error during global WASM cleanup:", e)
  );
});
