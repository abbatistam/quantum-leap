// src/core/wasm/wasm-loader.ts
import type { Matrix3x3 } from "../../types/core.types";
//import path from "node:path";
//import { fileURLToPath, pathToFileURL } from "node:url";
import wasmBinaryUrl from "./generated/matrix_ops.wasm?url";

// --- Interfaz del Módulo WASM (Exportada) ---
export interface MatrixOpsWasmModule extends EmscriptenModule {
  // Funciones Embind (C++)
  multiplyMatrices(aPtr: number, bPtr: number, outPtr: number): void;
  determinant(mPtr: number): number;
  invertMatrix(mPtr: number, outPtr: number): boolean; // Devuelve boolean
  solveHomographySVD(aPtr: number, bPtr: number, xPtr: number): boolean;
  transformPointsBatch(
    matrixPtr: number,
    pointsInPtr: number,
    pointsOutPtr: number,
    numPoints: number
  ): void;

  // Funciones Exportadas (C - con guion bajo)
  _malloc(size: number): number; // ptr
  _free(ptr: number): void;
}

// --- Singleton para el Módulo Cargado ---
let wasmModuleInstance: MatrixOpsWasmModule | null = null;
let wasmLoadingPromise: Promise<MatrixOpsWasmModule> | null = null;

// --- Path Helper ---
/** Calcula la ruta al archivo JS del módulo WASM dependiendo del entorno. */
function getWasmModulePath(): string {
  try {
    // Construye la URL al archivo JS generado RELATIVA a ESTE archivo (wasm-loader.ts).
    // Asumiendo que:
    // - wasm-loader.ts está en src/core/wasm/
    // - matrix_ops.js está en src/core/wasm/generated/
    const wasmJsUrl = new URL("./generated/matrix_ops.js", import.meta.url);
    // console.log(`[WASM Loader] Resolved WASM JS URL: ${wasmJsUrl.href}`); // Log para depurar
    return wasmJsUrl.href;
  } catch (e) {
    console.error("[WASM Loader] Error creating URL for WASM module:", e);
    return "error-creating-wasm-url"; // Devolver algo inválido
  }
}

// --- Carga del Módulo ---
/**
 * Carga (o devuelve la instancia cacheada) del módulo WebAssembly.
 * Utiliza un patrón singleton para asegurar una única instancia.
 * @returns Una promesa que resuelve con la instancia del módulo WASM inicializada.
 * @throws Error si la carga o inicialización falla.
 */
export async function loadWasmModule(): Promise<MatrixOpsWasmModule> {
  if (wasmModuleInstance) return wasmModuleInstance;
  if (wasmLoadingPromise) return wasmLoadingPromise;

  wasmLoadingPromise = new Promise(async (resolve, reject) => {
    try {
      const modulePath = getWasmModulePath(); // Obtiene URL del .js
      console.log(`[WASM Loader] Attempting to import JS: ${modulePath}`);
      console.log(
        `[WASM Loader] WASM binary URL resolved by Vite: ${wasmBinaryUrl}`
      ); // Log para ver la URL

      const wasmModuleExports = await import(/* @vite-ignore */ modulePath);
      const createModule = wasmModuleExports.default;
      if (typeof createModule !== "function") {
        /*...*/
      }

      const moduleConfig = {
        locateFile: (path: string, prefix: string) => {
          if (path.endsWith(".wasm")) {
            return wasmBinaryUrl; // Devuelve la URL importada por Vite
          }
          return prefix + path; // Comportamiento por defecto para otros archivos
        },
      };
      const instance: MatrixOpsWasmModule = await createModule(moduleConfig); // <---
      wasmModuleInstance = instance;
      if (!instance.HEAPF32) {
        /*...*/
      }
      if (typeof instance._malloc !== "function") {
        /*...*/
      }
      if (typeof instance._free !== "function") {
        /*...*/
      }
      resolve(instance);
    } catch (error) {
      /*...*/
    }
  });
  return wasmLoadingPromise;
}

// --- Gestión de Memoria Estática ---
const MATRIX_SIZE_BYTES = 9 * Float32Array.BYTES_PER_ELEMENT;
const HOMOGRAPHY_A_SIZE_BYTES = 64 * Float32Array.BYTES_PER_ELEMENT;
const HOMOGRAPHY_B_SIZE_BYTES = 8 * Float32Array.BYTES_PER_ELEMENT;
const HOMOGRAPHY_X_SIZE_BYTES = 8 * Float32Array.BYTES_PER_ELEMENT;
// Punteros globales a memoria estática WASM (gestionados por ensure/cleanup)
let wasm_matrix_a_ptr: number | null = null;
let wasm_matrix_b_ptr: number | null = null;
let wasm_matrix_out_ptr: number | null = null;
let wasm_homography_a_ptr: number | null = null;
let wasm_homography_b_ptr: number | null = null;
let wasm_homography_x_ptr: number | null = null;

/**
 * Asegura que la memoria estática global necesaria para las operaciones
 * esté alocada en el heap de WASM. Llama a _malloc si es necesario.
 * @throws Error si la alocación falla.
 */
export async function ensureStaticWasmMemory(): Promise<void> {
  // Añadido : Promise<void>
  const module = await loadWasmModule(); // Carga o obtiene instancia cacheada
  // Verificar si toda la memoria necesaria ya está alocada
  if (
    wasm_matrix_a_ptr !== null &&
    wasm_matrix_b_ptr !== null &&
    wasm_matrix_out_ptr !== null &&
    wasm_homography_a_ptr !== null &&
    wasm_homography_b_ptr !== null &&
    wasm_homography_x_ptr !== null
  ) {
    return; // Ya está todo listo
  }

  // Verificar que _malloc exista (ya verificado en loadWasmModule, pero doble chequeo no hace daño)
  if (typeof module._malloc !== "function") {
    throw new Error(
      "WASM module._malloc is not available for static memory allocation."
    );
  }

  // console.log("[WASM Loader] Allocating static memory via module._malloc..."); // Opcional
  try {
    // Alocar cada buffer si aún no existe
    if (wasm_matrix_a_ptr === null)
      wasm_matrix_a_ptr = module._malloc(MATRIX_SIZE_BYTES);
    if (wasm_matrix_b_ptr === null)
      wasm_matrix_b_ptr = module._malloc(MATRIX_SIZE_BYTES);
    if (wasm_matrix_out_ptr === null)
      wasm_matrix_out_ptr = module._malloc(MATRIX_SIZE_BYTES);
    if (wasm_homography_a_ptr === null)
      wasm_homography_a_ptr = module._malloc(HOMOGRAPHY_A_SIZE_BYTES);
    if (wasm_homography_b_ptr === null)
      wasm_homography_b_ptr = module._malloc(HOMOGRAPHY_B_SIZE_BYTES);
    if (wasm_homography_x_ptr === null)
      wasm_homography_x_ptr = module._malloc(HOMOGRAPHY_X_SIZE_BYTES);

    // Verificar si alguna alocación falló (malloc devuelve 0)
    if (
      !wasm_matrix_a_ptr ||
      !wasm_matrix_b_ptr ||
      !wasm_matrix_out_ptr ||
      !wasm_homography_a_ptr ||
      !wasm_homography_b_ptr ||
      !wasm_homography_x_ptr
    ) {
      // Limpiar lo que se haya podido alocar antes de lanzar el error
      await cleanupStaticWasmMemory();
      throw new Error(
        "module._malloc returned null or zero pointer during static memory allocation."
      );
    }
    // console.log("[WASM Loader] Static memory allocated."); // Opcional
  } catch (e) {
    console.error(
      "[WASM Loader] Error during static WASM memory allocation:",
      e
    );
    await cleanupStaticWasmMemory(); // Intentar limpiar
    // Relanzar el error para indicar el fallo
    throw new Error(
      `Failed to allocate static WASM memory: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  // No hay valor de retorno explícito (Promise<void>)
}

/** Libera la memoria estática global alocada usando module._free. */
export async function cleanupStaticWasmMemory(): Promise<void> {
  // Añadido : Promise<void>
  let module = wasmModuleInstance;
  // Solo intentar cargar si NO hay instancia Y hay punteros que liberar
  const hasPointers =
    wasm_matrix_a_ptr !== null ||
    wasm_matrix_b_ptr !== null ||
    wasm_matrix_out_ptr !== null ||
    wasm_homography_a_ptr !== null ||
    wasm_homography_b_ptr !== null ||
    wasm_homography_x_ptr !== null;

  if (!module && hasPointers) {
    console.warn(
      "[WASM Loader] Attempting to load module just to free static memory."
    );
    try {
      module = await loadWasmModule();
    } catch (e) {} // Intentar cargar, ignorar error aquí
  }

  const canFree = module && typeof module._free === "function";
  // console.log(`[WASM Loader] cleanupStaticWasmMemory called. Can free: ${canFree}`); // Opcional

  // Tipado explícito para el array de punteros
  const pointersToFree: (number | null)[] = [
    wasm_matrix_a_ptr,
    wasm_matrix_b_ptr,
    wasm_matrix_out_ptr,
    wasm_homography_a_ptr,
    wasm_homography_b_ptr,
    wasm_homography_x_ptr,
  ];

  pointersToFree.forEach((ptr) => {
    if (ptr !== null && canFree) {
      try {
        // console.log(`[WASM Loader] Freeing static pointer: ${ptr}`); // Opcional
        module!._free(ptr);
      } catch (e) {
        // Loguear error pero continuar con los demás
        console.error(
          `[WASM Loader] Error freeing static memory at pointer ${ptr}:`,
          e
        );
      }
    }
  });

  // Resetear punteros globales independientemente de si se pudo liberar
  wasm_matrix_a_ptr = wasm_matrix_b_ptr = wasm_matrix_out_ptr = null;
  wasm_homography_a_ptr = wasm_homography_b_ptr = wasm_homography_x_ptr = null;
  // console.log("[WASM Loader] Static memory pointers reset."); // Opcional
  // No hay valor de retorno explícito (Promise<void>)
}

// --- Funciones Wrapper de Alto Nivel (Usan memoria estática global) ---
// Estas asumen que ensureStaticWasmMemory se llamó antes o la llaman ellas mismas

/** Multiplica dos matrices 3x3 usando WASM. */
export async function multiplyWasm(
  a: Matrix3x3,
  b: Matrix3x3
): Promise<Matrix3x3> {
  await ensureStaticWasmMemory(); // Asegura que los punteros estáticos existan
  const module = wasmModuleInstance!; // Asumir que está cargado después de ensure
  // Copiar datos JS -> WASM
  module.HEAPF32.set(a, wasm_matrix_a_ptr! / 4);
  module.HEAPF32.set(b, wasm_matrix_b_ptr! / 4);
  // Llamar a la función C++
  module.multiplyMatrices(
    wasm_matrix_a_ptr!,
    wasm_matrix_b_ptr!,
    wasm_matrix_out_ptr!
  );
  // Copiar datos WASM -> JS
  const resultMatrix = new Float32Array(9) as Matrix3x3;
  resultMatrix.set(
    module.HEAPF32.subarray(
      wasm_matrix_out_ptr! / 4,
      wasm_matrix_out_ptr! / 4 + 9
    )
  );
  return resultMatrix;
}

/** Calcula el determinante de una matriz 3x3 usando WASM. */
export async function determinantWasm(m: Matrix3x3): Promise<number> {
  await ensureStaticWasmMemory();
  const module = wasmModuleInstance!;
  module.HEAPF32.set(m, wasm_matrix_a_ptr! / 4); // Usar el primer buffer para entrada
  const det = module.determinant(wasm_matrix_a_ptr!);
  return det;
}

/** Calcula la inversa de una matriz 3x3 usando WASM. Devuelve null si es singular. */
export async function inverseWasm(m: Matrix3x3): Promise<Matrix3x3 | null> {
  await ensureStaticWasmMemory();
  const module = wasmModuleInstance!;
  module.HEAPF32.set(m, wasm_matrix_a_ptr! / 4); // Usar A para entrada
  const success: boolean = module.invertMatrix(
    wasm_matrix_a_ptr!,
    wasm_matrix_out_ptr!
  ); // Usar OUT para salida
  if (!success) {
    return null; // La matriz era singular según C++
  } else {
    const resultMatrix = new Float32Array(9) as Matrix3x3;
    resultMatrix.set(
      module.HEAPF32.subarray(
        wasm_matrix_out_ptr! / 4,
        wasm_matrix_out_ptr! / 4 + 9
      )
    );
    // Opcional: Doble chequeo por si acaso C++ no devolvió NaN pero JS lo detecta
    if (resultMatrix.some((v) => !Number.isFinite(v))) {
      console.warn(
        "[WASM Loader] inverseWasm detected non-finite values in result despite success flag."
      );
      return null;
    }
    return resultMatrix;
  }
}

/** Resuelve la homografía Ax=b usando SVD en WASM. Devuelve null si falla o es singular. */
export async function solveHomographySvdWasm(
  A: Float32Array,
  b: Float32Array
): Promise<Float32Array | null> {
  if (A.length !== 64 || b.length !== 8)
    throw new Error("Invalid dimensions for solveHomographySvdWasm");
  await ensureStaticWasmMemory();
  const module = wasmModuleInstance!;
  // Copiar datos a los buffers de homografía estáticos
  module.HEAPF32.set(A, wasm_homography_a_ptr! / 4);
  module.HEAPF32.set(b, wasm_homography_b_ptr! / 4);
  // Llamar a la función C++
  const success = module.solveHomographySVD(
    wasm_homography_a_ptr!,
    wasm_homography_b_ptr!,
    wasm_homography_x_ptr!
  );
  if (!success) {
    return null; // Fallo de SVD o matriz singular
  }
  // Copiar resultado x desde el buffer estático
  const resultX = new Float32Array(8);
  resultX.set(
    module.HEAPF32.subarray(
      wasm_homography_x_ptr! / 4,
      wasm_homography_x_ptr! / 4 + 8
    )
  );
  // Opcional: Verificar si hay NaNs en el resultado JS
  if (resultX.some(isNaN)) {
    console.warn(
      "[WASM Loader] solveHomographySvdWasm detected NaN in result vector despite success flag."
    );
    return null;
  }
  return resultX;
}

// --- Wrapper de Transformación en Lote (Versión que COPIA) ---
/**
 * Transforma un lote de puntos usando WASM, alocando y liberando memoria
 * dinámicamente en cada llamada (menos eficiente para llamadas frecuentes).
 * @param matrix Matriz de transformación 3x3.
 * @param pointsIn Array plano de puntos [x1, y1, x2, y2, ...].
 * @returns Una promesa que resuelve con un NUEVO Float32Array con los puntos transformados.
 * @throws Error si la alocación de memoria WASM falla o la entrada es inválida.
 */
export async function transformPointsBatchWasm_Copy(
  matrix: Matrix3x3,
  pointsIn: Float32Array
): Promise<Float32Array> {
  // Verificar entrada
  if (pointsIn.length % 2 !== 0)
    throw new Error(
      "transformPointsBatchWasm_Copy: Input points array must have even elements."
    );
  const numPoints = pointsIn.length / 2;
  if (numPoints === 0) return new Float32Array(0); // Devolver array vacío si no hay puntos

  // Asegurar módulo y memoria estática (para la matriz)
  await ensureStaticWasmMemory();
  const module = wasmModuleInstance!; // Asumir cargado
  // Verificar disponibilidad de _malloc/_free (aunque ya debería estar chequeado en load)
  if (
    typeof module._malloc !== "function" ||
    typeof module._free !== "function"
  ) {
    throw new Error(
      "WASM instance requires _malloc and _free for dynamic allocation in Copy version."
    );
  }

  const pointsInBytes = pointsIn.byteLength;
  const pointsOutBytes = pointsInBytes; // Mismo tamaño para salida
  let pointsInPtr: number | null = null;
  let pointsOutPtr: number | null = null;

  try {
    // Alocar memoria dinámica para este lote específico
    pointsInPtr = module._malloc(pointsInBytes);
    pointsOutPtr = module._malloc(pointsOutBytes);
    // Verificar fallo de alocación
    if (!pointsInPtr || !pointsOutPtr) {
      // Intentar liberar lo que se haya podido alocar antes de lanzar
      if (pointsInPtr)
        try {
          module._free(pointsInPtr);
        } catch (e) {}
      if (pointsOutPtr)
        try {
          module._free(pointsOutPtr);
        } catch (e) {}
      throw new Error(
        "Failed WASM memory allocation via _malloc for points batch copy."
      );
    }

    // Copiar datos JS -> WASM
    module.HEAPF32.set(matrix, wasm_matrix_a_ptr! / 4); // Matriz a memoria estática
    module.HEAPF32.set(pointsIn, pointsInPtr / 4); // Puntos a memoria dinámica

    // Ejecutar la transformación C++/WASM (SIMD)
    module.transformPointsBatch(
      wasm_matrix_a_ptr!,
      pointsInPtr,
      pointsOutPtr,
      numPoints
    );

    // Copiar datos WASM -> JS (Crear nuevo array JS)
    const pointsOut = new Float32Array(numPoints * 2);
    // Crear una subvista del HEAP y copiarla al nuevo array JS
    pointsOut.set(
      module.HEAPF32.subarray(
        pointsOutPtr / 4,
        pointsOutPtr / 4 + numPoints * 2
      )
    );
    return pointsOut; // Devolver el resultado
  } finally {
    // Liberar memoria dinámica alocada en ESTA llamada, incluso si hubo error
    if (pointsInPtr !== null && module) {
      try {
        module._free(pointsInPtr);
      } catch (e) {
        console.error(
          "[WASM Loader] Error freeing pointsInPtr in Copy version:",
          e
        );
      }
    }
    if (pointsOutPtr !== null && module) {
      try {
        module._free(pointsOutPtr);
      } catch (e) {
        console.error(
          "[WASM Loader] Error freeing pointsOutPtr in Copy version:",
          e
        );
      }
    }
  }
  // CORRECCIÓN: Faltaba return dentro del try, ahora está antes del finally
}

// --- Limpieza Global ---
/**
 * Libera la memoria estática global y resetea el estado del loader singleton.
 * Debería llamarse si la aplicación sabe que ya no usará WASM.
 */
export async function cleanupWasm(): Promise<void> {
  // Añadido : Promise<void>
  // console.log("[WASM Loader] cleanupWasm called.");
  // NOTA: Ya no libera los buffers dinámicos reutilizables aquí.
  // Eso debe hacerse llamando a WasmBufferManager.cleanup()
  await cleanupStaticWasmMemory(); // Limpia solo la estática global
  wasmModuleInstance = null;
  wasmLoadingPromise = null;
  // console.log("[WASM Loader] Loader state reset."); // Opcional
  // No necesita return explícito
}
