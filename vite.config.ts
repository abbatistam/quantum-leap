// vite.config.ts
import { defineConfig } from "vite";
import path, { resolve } from "node:path"; // Para resolver rutas si es necesario

export default defineConfig(({ command, mode }) => {
  // Opciones comunes para dev y build
  const commonOptions = {
    // Opcional: Define la raíz del proyecto si no es el directorio actual
    // root: '.',
    // Directorio base público desde donde se sirven los assets estáticos
    // (como tu index.html si lo mueves aquí, o imágenes, etc.)
    // Por defecto es 'public'
    publicDir: "public",
    // Opciones del Servidor de Desarrollo
    server: {
      port: 5173, // Puerto por defecto (puedes cambiarlo)
      open: true, // Abrir automáticamente el navegador (opcional)
      // Necesario para que SharedArrayBuffer funcione si planeas usarlo
      // con WASM Threads o Web Workers en el futuro.
      // También configura cabeceras CORS necesarias.
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    // Opciones de Optimización (importante para WASM con Threads, útil en general)
    optimizeDeps: {
      exclude: ["@abbatistam/quantum-leap"], // Excluir tu propia librería si la linkeas localmente
      // Necesario si usas WASM con Threads
      // include: [],
    },
    // Opciones de Build (cuando ejecutes `vite build`)
    build: {
      outDir: "dist",
      rollupOptions: {
        input: {
          // Cada entrada es un par: nombre: ruta/al/html
          main: resolve(__dirname, "index.html"), // La página principal
          particles: resolve(__dirname, "examples/particles/index.html"), // Demo partículas
          mesh: resolve(__dirname, "examples/mesh/index.html"), // Demo malla
          compareLibs: resolve(__dirname, "examples/compare-libs/index.html"), // Demo comparación
          // Añade más entradas si tienes más páginas/demos HTML
        },
      },
    },
    // --- WASM ---
    // Vite tiene soporte experimental integrado para WASM, pero a veces
    // necesita ayuda, especialmente con Emscripten y workers.
    // Por ahora, nos aseguraremos de que los archivos .wasm se sirvan correctamente.
    // El plugin `vite-plugin-wasm` puede ayudar con integraciones más complejas.
    // El plugin `vite-plugin-top-level-await` también puede ser necesario
    // si usas top-level await y tu target no lo soporta.

    // --- Asegurar que los archivos WASM se manejen como assets ---
    // (Vite suele hacerlo por defecto, pero esto lo fuerza si hay problemas)
    assetsInclude: ["**/*.wasm"],

    // Resolver alias si importas tu librería de forma especial
    resolve: {
      alias: {
        // Ejemplo: si importas 'quantum-leap' en lugar de rutas relativas
        // 'quantum-leap': path.resolve(__dirname, './src/index.ts'),
      },
    },
  };

  if (command === "serve") {
    // Opciones específicas para DEV (`vite` o `vite dev`)
    return {
      ...commonOptions,
      // Opciones específicas de dev si las necesitas
    };
  } else {
    // Opciones específicas para BUILD (`vite build`)
    return {
      ...commonOptions,
      // Opciones específicas de build
    };
  }
});
