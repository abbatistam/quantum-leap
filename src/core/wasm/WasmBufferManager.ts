// src/core/wasm/WasmBufferManager.ts

import { loadWasmModule } from "./wasm-loader"; // Importa el loader
// Importar tipos necesarios
import type { Matrix3x3 } from "../../types/core.types";
// Importar la interfaz del módulo WASM (asumiendo que wasm-loader.ts la exporta)
import type { MatrixOpsWasmModule } from "./wasm-loader";

// --- Interfaz Pública del Buffer Gestionado ---

/**
 * Información sobre un buffer gestionado en memoria WASM, exponiendo la vista JS.
 * Esta estructura es devuelta por los métodos get*Buffer del WasmBufferManager.
 */
export interface ManagedWasmBuffer {
  /**
   * La vista Float32Array directamente sobre la memoria WASM.
   * Para buffers de entrada: Escribe los datos aquí ANTES de llamar a la operación WASM.
   * Para buffers de salida: Lee los resultados aquí DESPUÉS de que la operación WASM se complete.
   * La longitud de esta vista se ajusta dinámicamente a la capacidad solicitada
   * en la última llamada a get*Buffer que devolvió esta referencia específica.
   * ¡Precaución! Si la memoria WASM crece (ALLOW_MEMORY_GROWTH), las vistas antiguas pueden invalidarse.
   * Es más seguro obtener una vista fresca usando get*Buffer o getOutputView si se sospecha crecimiento.
   */
  readonly view: Float32Array;
  /**
   * El número máximo de puntos (pares de float) que caben actualmente en el buffer
   * de memoria WASM subyacente. Puede ser mayor que la longitud de `view` actual.
   */
  readonly capacityPoints: number;
  /** El tamaño total en bytes alocado en WASM para este buffer. */
  readonly sizeBytes: number;
}

interface InternalWasmBufferInfo extends ManagedWasmBuffer {
  readonly internalPointer: number; // Mantenemos el puntero internamente
}

// --- Clase del Gestor de Buffers ---

/**
 * Gestiona la alocación, reutilización y liberación de buffers de memoria
 * en el heap de WebAssembly para operaciones en lote (ej. transformación de puntos).
 * Encapsula el uso de _malloc y _free para los buffers dinámicos que gestiona
 * y la memoria estática que necesita para sus operaciones.
 *
 * Uso Típico:
 * 1. Crear instancia: `const manager = new WasmBufferManager();`
 * 2. Inicializar (carga WASM): `await manager.initialize();`
 * 3. Obtener buffers antes de la operación:
 *    `const inputBuf = await manager.getInputBuffer(numPoints);`
 *    `const outputBuf = await manager.getOutputBuffer(numPoints);`
 * 4. Escribir datos en la vista de entrada: `inputBuf.view.set(myJsData);`
 * 5. Ejecutar operación gestionada: `await manager.transformPointsBatchManaged(matrix, numPoints);`
 * 6. Leer resultados de la vista de salida: `const result = outputBuf.view[0];` (o usar `manager.getOutputView()`)
 * 7. Limpiar al final: `await manager.cleanup();`
 */
export class WasmBufferManager {
  private module: MatrixOpsWasmModule | null = null;
  private initialized: boolean = false;
  private staticMemoryEnsured: boolean = false; // Flag para memoria estática propia

  // Memoria estática necesaria para las operaciones gestionadas (ej. matriz)
  private staticMatrixPtr: number | null = null;
  private readonly MATRIX_SIZE_BYTES = 9 * Float32Array.BYTES_PER_ELEMENT;

  // Referencias internas a los buffers dinámicos reutilizables
  private inputBufferInternal: InternalWasmBufferInfo | null = null;
  private outputBufferInternal: InternalWasmBufferInfo | null = null;

  /**
   * Inicializa el gestor. Carga el módulo WebAssembly si aún no está cargado
   * y aloca la memoria estática requerida por las operaciones del gestor.
   * Debe llamarse y esperarse (`await`) antes de usar otros métodos.
   * @throws Error si la carga del módulo WASM o la alocación de memoria fallan.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn("[BufferMgr] Already initialized.");
      return;
    }
    console.log("[BufferMgr] Initializing...");
    try {
      // Carga o obtiene la instancia singleton del módulo WASM
      this.module = await loadWasmModule();

      // Verificar funciones y propiedades esenciales del módulo
      if (
        !this.module?._malloc ||
        !this.module?._free ||
        !this.module?.HEAPF32?.buffer
      ) {
        throw new Error(
          "WASM module is missing required functions (_malloc/_free) or HEAPF32.buffer."
        );
      }

      // Alocar memoria estática necesaria específicamente por este manager
      if (!this.staticMatrixPtr) {
        this.staticMatrixPtr = this.module._malloc(this.MATRIX_SIZE_BYTES);
        if (!this.staticMatrixPtr) {
          throw new Error(
            "Failed to malloc static memory for matrix in BufferManager."
          );
        }
        console.log(
          `[BufferMgr] Allocated static matrix buffer at ptr ${this.staticMatrixPtr}`
        );
      }
      this.staticMemoryEnsured = true; // Marcar como alocada
      this.initialized = true;
      console.log("[BufferMgr] Initialized successfully.");
    } catch (error) {
      console.error("[BufferMgr] Initialization failed:", error);
      // Intentar limpiar en caso de fallo parcial
      await this.cleanup(); // cleanup maneja el caso de módulo no cargado
      throw error; // Relanzar para notificar al llamador
    }
  }

  /**
   * Devuelve `true` si el gestor ha sido inicializado correctamente, `false` en caso contrario.
   */
  isInitialized(): boolean {
    return this.initialized && !!this.module;
  }

  /**
   * Método interno para asegurar que el gestor esté inicializado antes de operar.
   * @throws Error si no está inicializado.
   * @returns La instancia del módulo WASM cargado y verificado.
   */
  private ensureInitialized(): MatrixOpsWasmModule {
    if (!this.initialized || !this.module) {
      // Sugerir la causa más probable al usuario
      throw new Error(
        "WasmBufferManager not initialized. Call and await initialize() first."
      );
    }
    // Re-verificar funciones por si acaso, aunque initialize() ya lo hizo
    if (
      !this.module._malloc ||
      !this.module._free ||
      !this.module.HEAPF32?.buffer
    ) {
      throw new Error("WASM module became invalid after initialization.");
    }
    return this.module;
  }

  /**
   * Obtiene un buffer gestionado para escribir datos de ENTRADA.
   * Reutiliza el buffer interno si tiene capacidad suficiente, de lo contrario
   * libera el antiguo (si existe) y aloca uno nuevo más grande.
   * La `view` del objeto devuelto tendrá exactamente `minCapacityPoints * 2` elementos.
   *
   * @param minCapacityPoints La capacidad mínima requerida (en número de puntos).
   * @returns Una promesa que resuelve con la información del buffer de entrada.
   * @throws Error si la alocación de memoria falla o el gestor no está inicializado.
   */
  async getInputBuffer(minCapacityPoints: number): Promise<ManagedWasmBuffer> {
    // Llama a getManagedBuffer que devuelve InternalWasmBufferInfo
    const internalBuffer = await this.getManagedBuffer(
      minCapacityPoints,
      "input"
    );
    // Devuelve un objeto que cumple la interfaz PÚBLICA (sin internalPointer)
    return {
      view: internalBuffer.view,
      capacityPoints: internalBuffer.capacityPoints,
      sizeBytes: internalBuffer.sizeBytes,
    };
  }

  /**
   * Obtiene un buffer gestionado para leer datos de SALIDA.
   * Reutiliza el buffer interno si tiene capacidad suficiente, de lo contrario
   * libera el antiguo (si existe) y aloca uno nuevo más grande.
   * La `view` del objeto devuelto tendrá exactamente `capacityPoints * 2` elementos.
   *
   * @param capacityPoints La capacidad exacta requerida (en número de puntos).
   * @returns Una promesa que resuelve con la información del buffer de salida.
   * @throws Error si la alocación de memoria falla o el gestor no está inicializado.
   */
  async getOutputBuffer(capacityPoints: number): Promise<ManagedWasmBuffer> {
    const internalBuffer = await this.getManagedBuffer(
      capacityPoints,
      "output"
    );
    // Devuelve un objeto que cumple la interfaz PÚBLICA
    return {
      view: internalBuffer.view,
      capacityPoints: internalBuffer.capacityPoints,
      sizeBytes: internalBuffer.sizeBytes,
    };
  }

  /**
   * Lógica interna centralizada para obtener/gestionar buffers dinámicos reutilizables.
   * @param requiredPoints Número de puntos requeridos para esta operación.
   * @param type Indica si es el buffer de 'input' o 'output'.
   * @returns Información del buffer adecuado con una vista del tamaño correcto.
   */
  private async getManagedBuffer(
    requiredPoints: number,
    type: "input" | "output"
  ): Promise<InternalWasmBufferInfo> {
    const module = this.ensureInitialized(); // Asegura inicialización y obtiene módulo
    const requiredSizeBytes =
      requiredPoints * 2 * Float32Array.BYTES_PER_ELEMENT;
    let currentBufferInternal =
      type === "input" ? this.inputBufferInternal : this.outputBufferInternal;
    let finalBufferInfo: InternalWasmBufferInfo; // Para almacenar el buffer a devolver

    // Determinar si necesitamos alocar/realocar
    const needsAllocation =
      !currentBufferInternal ||
      currentBufferInternal.sizeBytes < requiredSizeBytes;

    if (needsAllocation) {
      // Liberar el buffer antiguo si existe antes de crear uno nuevo
      if (currentBufferInternal) {
        try {
          console.log(
            `[BufferMgr] Freeing old ${type} buffer (size ${currentBufferInternal.sizeBytes}) at ptr ${currentBufferInternal.internalPointer}`
          );
          module._free(currentBufferInternal.internalPointer);
        } catch (e) {
          console.error(`[BufferMgr] Error freeing old ${type} buffer:`, e);
        }
      }

      // Alocar el nuevo buffer
      // console.log(`[BufferMgr] Allocating new ${type} buffer: ${requiredSizeBytes} bytes for ${requiredPoints} points`);
      const newPointer = module._malloc(requiredSizeBytes);
      if (!newPointer) {
        // Verificar si malloc falló
        throw new Error(
          `Failed to _malloc ${requiredSizeBytes} bytes for ${type} buffer.`
        );
      }

      // Crear la nueva estructura de información del buffer
      finalBufferInfo = {
        internalPointer: newPointer,
        sizeBytes: requiredSizeBytes,
        capacityPoints: requiredPoints, // Capacidad actual coincide con lo solicitado
        view: new Float32Array(
          module.HEAPF32.buffer,
          newPointer,
          requiredPoints * 2
        ),
      };

      // Actualizar la referencia interna del manager al NUEVO buffer
      if (type === "input") this.inputBufferInternal = finalBufferInfo;
      else this.outputBufferInternal = finalBufferInfo;
      console.log(
        `[BufferMgr] Allocated new ${type} buffer: ${finalBufferInfo.sizeBytes} bytes at ptr ${finalBufferInfo.internalPointer}`
      );
    } else {
      // Reutilizar el buffer existente
      // ¡Asegurarle a TypeScript que no es null aquí!
      if (!currentBufferInternal) {
        throw new Error(
          "Internal error: existing buffer is unexpectedly null during reuse logic."
        );
      }
      // console.log(`[BufferMgr] Reusing existing ${type} buffer (capacity ${currentBufferInternal.capacityPoints} points / ${currentBufferInternal.sizeBytes} bytes) for ${requiredPoints} points`);

      // Crear una NUEVA VISTA con la longitud correcta sobre el buffer existente
      const currentView = new Float32Array(
        module.HEAPF32.buffer,
        currentBufferInternal.internalPointer,
        requiredPoints * 2
      );

      // Crear un NUEVO objeto ManagedWasmBuffer para devolver.
      // Esto es importante para que la 'view' devuelta tenga la longitud correcta
      // y para evitar que diferentes llamadas modifiquen la misma referencia de objeto JS.
      finalBufferInfo = {
        internalPointer: currentBufferInternal.internalPointer, // Puntero del buffer existente
        sizeBytes: currentBufferInternal.sizeBytes, // Tamaño total alocado del buffer
        capacityPoints: currentBufferInternal.capacityPoints, // Capacidad total del buffer
        view: currentView, // La vista con la longitud correcta
      };
      // NO actualizamos this.inputBufferInternal/this.outputBufferInternal aquí,
      // ya que la referencia interna debe mantener la información del buffer completo.
    }

    return finalBufferInfo; // Devolver la información del buffer (nuevo o reutilizado con vista actualizada)
  }

  /**
   * Ejecuta la transformación de puntos en lote usando los buffers internos gestionados.
   * Asume que los datos de entrada ya han sido escritos en la `view` obtenida de `getInputBuffer`.
   * El resultado estará disponible en la `view` del buffer de salida después de que la promesa resuelva.
   *
   * @param matrix La matriz de transformación 3x3.
   * @param numPoints El número de puntos a transformar (debe ser <= a la capacidad de los buffers obtenidos).
   * @returns Una promesa que resuelve cuando la operación WASM ha terminado.
   * @throws Error si el gestor no está inicializado, los buffers no están listos o no tienen capacidad.
   */
  async transformPointsBatchManaged(
    matrix: Matrix3x3,
    numPoints: number
  ): Promise<void> {
    const module = this.ensureInitialized();
    if (!this.staticMatrixPtr) {
      throw new Error("Static matrix buffer not allocated.");
    }
    // Usar las referencias internas que SÍ tienen el puntero
    if (
      !this.inputBufferInternal ||
      !this.outputBufferInternal ||
      this.inputBufferInternal.capacityPoints < numPoints ||
      this.outputBufferInternal.capacityPoints < numPoints
    ) {
      throw new Error(
        `Managed buffers not ready/lack capacity for ${numPoints} points.`
      );
    }
    if (
      !this.inputBufferInternal.internalPointer ||
      !this.outputBufferInternal.internalPointer
    ) {
      throw new Error("Internal buffer pointers are invalid.");
    }

    module.HEAPF32.set(matrix, this.staticMatrixPtr / 4);
    module.transformPointsBatch(
      this.staticMatrixPtr,
      this.inputBufferInternal.internalPointer, // Usar puntero interno
      this.outputBufferInternal.internalPointer, // Usar puntero interno
      numPoints
    );
  }

  /**
   * Obtiene una VISTA del buffer de salida interno con la longitud especificada.
   * Útil para leer resultados DESPUÉS de llamar a `transformPointsBatchManaged`.
   *
   * ¡PRECAUCIÓN! No almacene esta vista a largo plazo si la memoria WASM puede crecer.
   *
   * @param numPoints El número de puntos cuyo resultado se quiere leer (longitud de la vista = numPoints * 2)
   * @returns Una `Float32Array` apuntando a la memoria de salida WASM, o `null` si el buffer no está listo.
   * @throws Error si `numPoints` excede la capacidad del buffer de salida.
   */
  getOutputView(numPoints: number): Float32Array | null {
    const module = this.module; // Usar instancia guardada
    const outputBuffer = this.outputBufferInternal; // Usar buffer interno

    if (!module?.HEAPF32?.buffer || !outputBuffer) {
      console.warn(
        "[BufferMgr] Cannot get output view: Not initialized or output buffer missing."
      );
      return null;
    }
    const requestedElements = numPoints * 2;
    if (outputBuffer.capacityPoints * 2 < requestedElements) {
      console.error(
        `[BufferMgr] Request for ${numPoints} points exceeds output buffer capacity (${outputBuffer.capacityPoints}).`
      );
      return null; // O lanzar error
    }
    try {
      // Crear y devolver una nueva vista con la longitud correcta
      return new Float32Array(
        module.HEAPF32.buffer,
        outputBuffer.internalPointer,
        requestedElements
      );
    } catch (e) {
      console.error("[BufferMgr] Error creating output view:", e);
      return null;
    }
  }

  /**
   * Libera toda la memoria alocada por este gestor (la estática que alocó
   * para la matriz y los buffers dinámicos reutilizables de entrada/salida).
   * Debería llamarse cuando el gestor ya no se necesite.
   */
  async cleanup(): Promise<void> {
    // ... (Lógica de limpieza como antes, usando internalPointer de los buffers internos) ...
    console.log("[BufferMgr] Cleaning up allocated buffers...");
    let module = this.module;
    if (!module) {
      try {
        module = await loadWasmModule();
      } catch (e) {}
    }
    const canFree = module && typeof module._free === "function";
    [this.inputBufferInternal, this.outputBufferInternal].forEach(
      (bufferInfo) => {
        if (bufferInfo && canFree) {
          try {
            module!._free(bufferInfo.internalPointer);
          } catch (e) {
            /*...*/
          }
        }
      }
    );
    this.inputBufferInternal = null;
    this.outputBufferInternal = null;
    if (this.staticMatrixPtr && canFree) {
      try {
        module!._free(this.staticMatrixPtr);
      } catch (e) {
        /*...*/
      }
    }
    this.staticMatrixPtr = null;
    this.staticMemoryEnsured = false;
    this.initialized = false;
    this.module = null;
    console.log("[BufferMgr] Cleanup complete.");
  }
}
