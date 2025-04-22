# Project Quantum Leap: High-Performance 2D Transformation Library

[![npm version](https://badge.fury.io/js/%40your-npm-scope%2Fquantum-leap.svg)](https://badge.fury.io/js/%40your-npm-scope%2Fquantum-leap)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<!-- Add other badges like build status or coverage here -->

**Achieve extreme performance for demanding 2D transformations in JavaScript and WebAssembly.**

Quantum Leap is a library designed for scenarios requiring high-throughput 2D geometric transformations, such as complex visualizations, interactive design tools, simulations, and high-performance web-based graphics.

It leverages **WebAssembly (WASM)**, **SIMD** instructions, and **efficient memory management** to deliver significant speedups over standard JavaScript implementations, especially when processing large batches of points or performing complex calculations like perspective transformations (homography).

**➡️ Live Demos:**

- **[Particle Benchmark](link-to-particle-demo)** <!-- README-TODO: Add link -->
- **[Interactive Mesh](link-to-mesh-demo)** <!-- README-TODO: Add link -->
- **[Library Comparison Benchmark](link-to-compare-libs-demo)** <!-- README-TODO: Add link -->

**[➡️ Documentation Here!]** <!-- README-TODO: Replace with link to docs, or remove if none -->

## Key Features

- 🚀 **High-Performance WASM Core:** Critical mathematical operations (Matrix Multiply, Invert, SVD, Point Batch Transformation) implemented in C++ (using Eigen) and compiled to WASM for near-native speed.
- ⚡ **SIMD Accelerated Batch Processing:** Point transformations leverage WASM SIMD128 for significant parallel processing gains on large datasets (see Performance).
- 🧠 **Optimized Memory Management:** Features a `WasmBufferManager` for reusing WASM memory buffers, drastically reducing JavaScript-WASM data transfer overhead and minimizing GC pressure in high-frequency operations.
- 📐 **Robust Homography:** Calculates perspective transformations using robust Singular Value Decomposition (SVD) in WASM.
- ✨ **Modern JavaScript API:** Offers a clean TypeScript-based API, including:
  - Standard transformation commands (`Translate`, `Scale`, `Rotate`, `Skew`, `Crop`, `Resize`, `Perspective`).
  - `AffineTransform` class for convenient matrix manipulation.
  - `MatrixUtils` for low-level matrix operations.
  - `TransformCore` for managing transformation state.
  - `TransformHistory` for undo/redo capabilities.
- 🧪 **Well-Tested:** Includes a comprehensive test suite.

## Performance Highlights (WASM vs JS & Libraries)

Benchmarks demonstrate significant performance improvements, especially when using the managed WASM buffers (`WasmBufferManager`) to minimize JS <-> WASM data copying:

- **Batch Point Transformation (`transformPointsBatchManaged`):**
  - Achieves **~4x - 10x+ speedup** in demo scenarios compared to pure JS loops.
  - Outperforms equivalent JavaScript update loops in popular rendering libraries like **PixiJS (~30x faster)** and **Three.js (~20x faster)** for the specific task of calculating transformations for **500,000** objects per frame on the CPU. _(This highlights the efficiency for CPU-bound transformation calculations, not overall rendering)_.
  - _(See the [Particle Comparison Demo](link-to-particle-demo) and [Library Comparison Demo](link-to-compare-libs-demo) for live examples)_ <!-- README-TODO: Add links -->
- **Homography Calculation (PerspectiveCommand - SVD):**
  - **~3x faster** than comparable JS-based approaches due to optimized WASM SVD using Eigen.

_(Note: Performance measured on [Your CPU Info, e.g., Intel Core i7-XXXX / Apple M1] using [Your Browser Info, e.g., Chrome 1XX]. Actual results may vary based on hardware, browser, and workload.)_ <!-- README-TODO: Fill in your test environment details -->

## Getting Started

```bash
# Using pnpm
pnpm add @your-npm-scope/quantum-leap

# Using npm
npm install @your-npm-scope/quantum-leap

# Using yarn
yarn add @your-npm-scope/quantum-leap
```

```javascript
// README-TODO: Update package name
import { MatrixUtils, AffineTransform } from "@your-npm-scope/quantum-leap";

// Basic Usage (JS)
const m1 = MatrixUtils.translation(10, 5);
const m2 = MatrixUtils.rotation(Math.PI / 4);
const combinedMatrix = MatrixUtils.multiply(m2, m1); // R * T

const point = { x: 100, y: 0 };
const transformedPoint = MatrixUtils.transformPoint(combinedMatrix, point);
console.log("Transformed Point (JS Utils):", transformedPoint);
// Expected: { x: 67.17..., y: 74.24... }

// Using AffineTransform (more convenient)
const transform = new AffineTransform();
transform.translate(10, 5); // Mutable translate
transform.rotate(Math.PI / 4); // Mutable rotate
transform.scale(2, 2); // Mutable scale
const finalMatrix = transform.toMatrix();

const p2 = transform.applyToPoint({ x: 50, y: 50 });
console.log("Transformed Point (AffineTransform):", p2);
```

# High-Performance Batching with `WasmBufferManager`

For maximum performance when transforming many points repeatedly (e.g., >1000 points in an animation loop), use the `WasmBufferManager`. This minimizes the expensive data copying between JavaScript and WebAssembly memory.

## Workflow

1. **Initialize**  
   Create and await `manager.initialize()`. Loads WASM.

   ```js
   import { WasmBufferManager } from "your-wasm-lib";

   const manager = new WasmBufferManager();
   await manager.initialize();
   ```

2. **Get Buffers**
   Use await manager.getInputBuffer(numPoints) and await manager.getOutputBuffer(numPoints).
   This allocates/resizes memory inside WASM if needed.

   ```js
   const numPoints = 1500;

   const inputBuffer = await manager.getInputBuffer(numPoints);

   const outputBuffer = await manager.getOutputBuffer(numPoints);
   ```

3. **Write Input**
   Copy your JavaScript point data `(Float32Array)` into the `.view` property of the input buffer.
   Do this only when data changes, ideally outside the measurement loop.

   ```js
   const myPointsJS = new Float32Array([
     /* x0, y0, x1, y1, ..., xn, yn */
   ]);

   inputBuffer.view.set(myPointsJS);
   ```

4. **Execute WASM**
   Call `await manager.transformPointsBatchManaged(matrix, numPoints)`.

   This runs the fast C++/SIMD code using internal pointers, operating directly on WASM memory.

   ```js
   const matrix = new Float32Array([
     // 2x3 or 3x3 transform matrix values, depending on implementation
   ]);

   await manager.transformPointsBatchManaged(matrix, numPoints);
   ```

5. **Read Output**
   Access the results directly from the `.view` property of the output buffer:
   ```js
   const results = outputBuffer.view;
   ```
   Or, get a fresh view with the correct length:
   ```js
   const results = manager.getOutputView(numPoints);
   ```
6. **Cleanup**
   When you're completely done, free the allocated WASM memory:

   ```js
   await manager.cleanup();
   ```

   **Full Example**

   ```js
   import {
     WasmBufferManager,
     MatrixUtils,
   } from "@your-npm-scope/quantum-leap"; // README-TODO: Update package name

   async function highPerfAnimation() {
     const numPoints = 100000;
     // Your source point data [x1, y1, x2, y2, ...]
     const myPointsJS = new Float32Array(numPoints * 2);
     // ... (fill myPointsJS with initial data) ...

     const manager = new WasmBufferManager();

     try {
       // 1. Initialize (Loads WASM, allocates manager's static memory)
       await manager.initialize();
       console.log("WASM Manager Initialized");

       // 2. Get reusable WASM buffers (allocates/resizes internal WASM memory)
       console.log("Getting WASM buffers...");
       const inputBuffer = await manager.getInputBuffer(numPoints);
       const outputBuffer = await manager.getOutputBuffer(numPoints); // Ensures output buffer exists and has capacity
       console.log(
         `Input buffer ready (Capacity: ${inputBuffer.capacityPoints} points)`
       );
       console.log(
         `Output buffer ready (Capacity: ${outputBuffer.capacityPoints} points)`
       );

       // --- Animation Loop Example ---
       let frameCount = 0;
       const animationLoop = async () => {
         if (frameCount > 300) {
           // Stop after some frames
           console.log("Animation finished.");
           await manager.cleanup(); // Cleanup when done
           return;
         }

         // 3. Update transformation matrix (example)
         const angle = performance.now() / 1000;
         const matrix = MatrixUtils.rotation(angle); // Simple rotation for example

         // 4. Write JS data to WASM input buffer VIEW
         //    (Only copy the needed portion if myPointsJS is larger)
         inputBuffer.view.set(myPointsJS.subarray(0, numPoints * 2));

         // --- Performance Critical Section ---
         const startTime = performance.now();

         // 5. Execute transformation in WASM using managed buffers
         await manager.transformPointsBatchManaged(matrix, numPoints);

         const endTime = performance.now();
         // --- End Critical Section ---

         // 6. Read results directly from WASM output buffer VIEW
         //    Get a fresh view to ensure correct length (optional but safer)
         const resultsView = manager.getOutputView(numPoints);

         if (resultsView) {
           // Use resultsView for drawing, physics, etc.
           if (frameCount % 60 === 0) {
             // Log periodically
             console.log(
               `Frame ${frameCount}, WASM Transform Time: ${(endTime - startTime).toFixed(2)} ms`
             );
             // console.log("First transformed point:", resultsView[0], resultsView[1]);
           }
         } else {
           console.error("Could not get output view for frame", frameCount);
         }

         frameCount++;
         requestAnimationFrame(animationLoop);
       };
       requestAnimationFrame(animationLoop);
       // --- End Animation Loop ---
     } catch (error) {
       console.error("WASM setup or execution failed:", error);
       // Ensure cleanup is attempted even on error
       await manager
         .cleanup()
         .catch((e) => console.error("Cleanup failed after error:", e));
     }
   }

   // Run the example
   highPerfAnimation();

   // Note: Robust cleanup in real applications might require listening
   // to 'beforeunload' or framework-specific lifecycle hooks.
   ```

   ## Roadmap & Philosophy

   Project Quantum Leap aims to be the indispensable library for high-performance 2D transformations. Our focus is on:

   1. **Extreme Performance**: Leveraging WASM, SIMD, and optimized memory management.
   2. **Robustness**: Using stable algorithms (like SVD for homography) and extensive testing.
   3. **Solving Niche Problems**: Targeting industries and applications (like Web CAD & Web GIS) with demanding transformation needs.

   ## License

   This project is licensed under the MIT License - see the LICENSE file for details.
