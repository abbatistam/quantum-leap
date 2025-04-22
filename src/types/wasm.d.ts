// src/types/wasm.d.ts
declare module "/wasm/matrix_ops.js" {
  // Importa la interfaz que ya definiste
  import type { MatrixOpsWasmModule } from "../core/wasm-loader";

  // Define la exportación 'default' como la factory function
  const createModule: () => Promise<MatrixOpsWasmModule>;
  export default createModule;
}
