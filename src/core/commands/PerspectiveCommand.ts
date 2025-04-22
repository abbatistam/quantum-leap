import { PerspectiveCommandJSON } from "../../types/commands.types";
import { Matrix3x3, Point } from "../../types/core.types";
import { MatrixError } from "../../types/errors.model";
import { isValidNumber, isValidPoint } from "../../utils/utils";
import { MatrixUtils } from "../matrix/MatrixUtils";
// Assuming solveHomographySvdWasm is still needed for create
import { solveHomographySvdWasm } from "../wasm/wasm-loader";
import { TransformCommand } from "./TransformCommand";

export class PerspectiveCommand implements TransformCommand {
  readonly name = "perspective";
  // --- CAMBIO: Declaración explícita del orden esperado por el constructor ---
  private readonly sourcePointsInternal: Readonly<[Point, Point, Point, Point]>;
  private readonly destPointsInternal: Readonly<[Point, Point, Point, Point]>;
  private readonly homography: Matrix3x3;

  /**
   * Constructor privado.
   * Orden de parámetros: sourcePoints, destPoints, homography
   */
  private constructor(
    sourcePoints: Readonly<[Point, Point, Point, Point]>,
    destPoints: Readonly<[Point, Point, Point, Point]>,
    precomputedHomography: Matrix3x3 // La homografía va al final
  ) {
    // Copia profunda para inmutabilidad interna
    this.sourcePointsInternal = Object.freeze(
      sourcePoints.map((p) => ({ ...p })) as [Point, Point, Point, Point]
    );
    this.destPointsInternal = Object.freeze(
      destPoints.map((p) => ({ ...p })) as [Point, Point, Point, Point]
    );
    // La homografía ya es una copia o se trata como inmutable
    this.homography = precomputedHomography;
  }

  public getHomographyMatrix(): Matrix3x3 {
    // Devuelve la referencia interna; Matrix3x3 debería ser tratado como inmutable
    // o MatrixUtils debería devolver siempre nuevas instancias.
    return this.homography;
  }

  /**
   * Crea una instancia de PerspectiveCommand. (Sigue siendo ASÍNCRONO por SVD)
   */
  static async create(
    srcPts: [Point, Point, Point, Point],
    dstPts: [Point, Point, Point, Point]
  ): Promise<PerspectiveCommand> {
    // 1) Length Validation
    if (
      !Array.isArray(srcPts) ||
      srcPts.length !== 4 ||
      !Array.isArray(dstPts) ||
      dstPts.length !== 4
    ) {
      throw new MatrixError(
        "Source and destination must be arrays of 4 points.",
        "INVALID_HOMOGRAPHY_POINTS"
      );
    }
    // 2) Point Validity Validation
    for (const p of [...srcPts, ...dstPts]) {
      if (!isValidPoint(p)) {
        throw new MatrixError(
          "All points must be valid {x, y} objects with finite numbers.",
          "INVALID_HOMOGRAPHY_POINTS"
        );
      }
    }
    // 3) Coincidence Check (prevents singular matrices)
    if (
      PerspectiveCommand.hasCoincidentPointsInternal(srcPts) || // Usar el método estático correctamente
      PerspectiveCommand.hasCoincidentPointsInternal(dstPts) // Usar el método estático correctamente
    ) {
      throw new MatrixError(
        "Points in source or destination set are coincident or too close, leading to a singular matrix.",
        "SINGULAR_MATRIX"
      );
    }
    // 4) Compute Homography
    let H: Matrix3x3;
    try {
      // Usar el método estático correctamente
      H = await PerspectiveCommand.computeHomographyInternal(srcPts, dstPts);
    } catch (err: any) {
      console.error("Error computing homography:", err);
      if (err instanceof MatrixError) {
        // Re-throw specific MatrixErrors
        throw err;
      }
      // Wrap unexpected errors
      throw new MatrixError(
        `Internal error during homography computation: ${err.message || err}`,
        "INTERNAL_ERROR"
      );
    }
    // 5) Return new instance with CORRECT argument order
    // --- CORRECCIÓN: Orden de los argumentos ---
    return new PerspectiveCommand(srcPts, dstPts, H); // source, destination, homography
  }

  /**
   * Aplica la inversa de la transformación perspectiva a la matriz dada. (SÍNCRONO)
   * Multiplica: matrix * homographyInv
   */
  execute(matrix: Matrix3x3): Matrix3x3 {
    try {
      // Calcula la inversa de la homografía precalculada (síncrono)
      const homographyInv = MatrixUtils.inverse(this.homography);
      if (!homographyInv) {
        // La inversa no pudo ser calculada (matriz singular)
        console.error(
          "PerspectiveCommand execution failed: Internal homography matrix is singular."
        );
        throw new MatrixError(
          "Cannot execute command: the precomputed homography matrix is singular.",
          "SINGULAR_MATRIX"
        );
      }
      // Aplica la transformación multiplicando la matriz de entrada por la inversa (síncrono)
      // Devuelve una nueva matriz resultado de la multiplicación
      return MatrixUtils.multiply(matrix, homographyInv);
    } catch (error) {
      // error is unknown
      console.error("Error during PerspectiveCommand execution:", error); // Log the raw error

      if (error instanceof MatrixError) {
        throw error; // Re-throw specific known error
      }

      // Determine the message safely
      let message = "An unknown error occurred during execution.";
      if (error instanceof Error) {
        // If it's an Error instance, we can safely access .message
        message = error.message;
      } else if (typeof error === "string") {
        // If it's a string, use it directly
        message = error;
      } else {
        // For other types, try converting to string
        // You could also try JSON.stringify for objects, but String() is a safe fallback
        message = String(error);
      }

      // Wrap the original error (or its message) in a MatrixError
      throw new MatrixError(
        `Perspective transformation failed during execution: ${message}`,
        "EXECUTION_FAILED"
        // Optional: Pass the original error for inspection if needed
        // error // You might need to adjust MatrixError constructor if you want to add 'cause'
      );
      // --- END FIX ---
    }
  }

  toString(): string {
    // Proporciona una representación un poco más informativa si es posible
    // (Podría truncar los puntos si son demasiados)
    const srcStr = this.sourcePointsInternal
      .map((p) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
      .join(";");
    const dstStr = this.destPointsInternal
      .map((p) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
      .join(";");
    return `Perspective Transformation (src:[${srcStr}] -> dst:[${dstStr}])`;
  }

  toJSON(): PerspectiveCommandJSON {
    // Asegura la creación de nuevas copias de los puntos para la serialización JSON
    return {
      type: "perspective",
      sourcePoints: this.sourcePointsInternal.map((p) => ({ ...p })) as [
        Point,
        Point,
        Point,
        Point,
      ],
      destPoints: this.destPointsInternal.map((p) => ({ ...p })) as [
        Point,
        Point,
        Point,
        Point,
      ],
      // No incluir la matriz de homografía calculada en el JSON,
      // ya que se deriva de los puntos y es estado interno.
      // Si se necesitara, habría que añadirla aquí.
    };
  }

  // --- Métodos Helper Estáticos Internos ---
  // (Asegúrate de que se llaman estáticamente: PerspectiveCommand.methodName)

  private static hasCoincidentPointsInternal(
    points: Readonly<Point[]>,
    epsilon: number = MatrixUtils.getEpsilon()
  ): boolean {
    if (!points || points.length < 2) return false;
    for (let i = 0; i < points.length; i++) {
      const pi = points[i];
      // Comprobar validez del punto i
      if (!pi || !isValidNumber(pi.x) || !isValidNumber(pi.y)) continue; // O lanzar error? Depende del contexto. Aquí mejor continuar chequeo.
      for (let j = i + 1; j < points.length; j++) {
        const pj = points[j];
        // Comprobar validez del punto j
        if (!pj || !isValidNumber(pj.x) || !isValidNumber(pj.y)) continue;
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        // Usar Math.hypot para distancia euclidiana (más robusto a overflow/underflow que dx*dx+dy*dy)
        // if (Math.hypot(dx, dy) < epsilon) return true; // Alternativa
        if (Math.abs(dx) < epsilon && Math.abs(dy) < epsilon) return true;
      }
    }
    return false;
  }

  // Normalización de puntos (Hartley's method)
  private static normalizePointsInternal(
    points: Readonly<Point[]>
  ): [Point[], Matrix3x3] {
    const numPoints = points.length;
    let sumX = 0,
      sumY = 0,
      validPointsCount = 0;

    // Calcular centroide solo de puntos válidos
    for (const p of points) {
      if (p && isValidNumber(p.x) && isValidNumber(p.y)) {
        sumX += p.x;
        sumY += p.y;
        validPointsCount++;
      }
    }

    // Manejar caso sin puntos válidos
    if (validPointsCount < 1) {
      console.warn("normalizePointsInternal called with no valid points.");
      // Devuelve los puntos originales (o NaN si no eran válidos) y la identidad
      const resultPoints = points.map(
        (p) =>
          p && isValidNumber(p.x) && isValidNumber(p.y)
            ? { ...p } // Copia si es válido
            : { x: NaN, y: NaN } // Marca como NaN si no es válido
      );
      return [resultPoints, MatrixUtils.identity()];
    }

    const centroidX = sumX / validPointsCount;
    const centroidY = sumY / validPointsCount;

    // Calcular distancia media desde el centroide
    let totalDistance = 0;
    for (const p of points) {
      if (p && isValidNumber(p.x) && isValidNumber(p.y)) {
        const dx = p.x - centroidX;
        const dy = p.y - centroidY;
        totalDistance += Math.sqrt(dx * dx + dy * dy); // o Math.hypot(dx, dy)
      }
    }

    // Evitar división por cero si todos los puntos válidos coinciden
    const avgDistance = totalDistance / validPointsCount;
    const epsilon = MatrixUtils.getEpsilon();
    const scale = avgDistance > epsilon ? Math.SQRT2 / avgDistance : 1.0;

    // Matriz de Normalización T = [scale 0 -scale*cx; 0 scale -scale*cy; 0 0 1]
    // El orden aquí es importante para fromValues (asumiendo row-major)
    const T = MatrixUtils.fromValues(
      scale,
      0,
      -scale * centroidX, // Row 1
      0,
      scale,
      -scale * centroidY, // Row 2
      0,
      0,
      1 // Row 3
    );

    // Aplicar normalización a los puntos válidos
    const normalizedPoints: Point[] = points.map((p) => {
      if (p && isValidNumber(p.x) && isValidNumber(p.y)) {
        return { x: scale * (p.x - centroidX), y: scale * (p.y - centroidY) };
      } else {
        return { x: NaN, y: NaN }; // Mantener puntos inválidos como NaN
      }
    });

    return [normalizedPoints, T];
  }

  /**
   * Calcula la homografía usando SVD (a través de WASM). Sigue siendo ASÍNCRONO.
   * H tal que: p_dst ≈ H * p_src
   * Resuelve el sistema Ah = b para h (vector de 8 elementos de H).
   */
  private static async computeHomographyInternal(
    src: Readonly<[Point, Point, Point, Point]>,
    dst: Readonly<[Point, Point, Point, Point]>
  ): Promise<Matrix3x3> {
    // 1. Normalizar puntos (mejora estabilidad numérica)
    const [normalizedSrc, Tsrc] =
      PerspectiveCommand.normalizePointsInternal(src);
    const [normalizedDst, Tdst] =
      PerspectiveCommand.normalizePointsInternal(dst);

    // 2. Construir la matriz A (8x8) y el vector b (8x1) para el sistema Ah=b
    //    A está en column-major para WASM? Verificar documentación de solveHomographySvdWasm
    //    Aquí se asume column-major por el indexado A[col*rows + row]
    //    Si WASM espera row-major, el indexado debería ser A[row*cols + col]
    //    Asumiremos que solveHomographySvdWasm espera A en column-major (8 filas, 8 columnas)
    //    y b (vector de 8 elementos)
    const A_wasm = new Float32Array(64); // 8x8
    const b_wasm = new Float32Array(8); // 8x1

    for (let i = 0; i < 4; i++) {
      const { x: xs, y: ys } = normalizedSrc[i];
      const { x: xd, y: yd } = normalizedDst[i];

      // Verificar si algún punto normalizado es inválido (e.g., si la entrada tenía NaN)
      if (
        !isValidNumber(xs) ||
        !isValidNumber(ys) ||
        !isValidNumber(xd) ||
        !isValidNumber(yd)
      ) {
        throw new MatrixError(
          "Invalid normalized points encountered during homography computation.",
          "INTERNAL_ERROR" // O quizás INVALID_HOMOGRAPHY_POINTS si la causa raíz fue esa
        );
      }

      const row1 = i * 2; // Índice de la primera ecuación para el punto i (0, 2, 4, 6)
      const row2 = row1 + 1; // Índice de la segunda ecuación para el punto i (1, 3, 5, 7)

      // Rellenar A (column-major: A[col*num_rows + row]) y b
      // Ecuación 1: xs*h0 + ys*h1 + h2 - xs*xd*h6 - ys*xd*h7 = xd
      A_wasm[0 * 8 + row1] = xs; // Col 0 (h0)
      A_wasm[1 * 8 + row1] = ys; // Col 1 (h1)
      A_wasm[2 * 8 + row1] = 1; // Col 2 (h2)
      A_wasm[3 * 8 + row1] = 0; // Col 3 (h3)
      A_wasm[4 * 8 + row1] = 0; // Col 4 (h4)
      A_wasm[5 * 8 + row1] = 0; // Col 5 (h5)
      A_wasm[6 * 8 + row1] = -xs * xd; // Col 6 (h6)
      A_wasm[7 * 8 + row1] = -ys * xd; // Col 7 (h7)
      b_wasm[row1] = xd;

      // Ecuación 2: xs*h3 + ys*h4 + h5 - xs*yd*h6 - ys*yd*h7 = yd
      A_wasm[0 * 8 + row2] = 0; // Col 0 (h0)
      A_wasm[1 * 8 + row2] = 0; // Col 1 (h1)
      A_wasm[2 * 8 + row2] = 0; // Col 2 (h2)
      A_wasm[3 * 8 + row2] = xs; // Col 3 (h3)
      A_wasm[4 * 8 + row2] = ys; // Col 4 (h4)
      A_wasm[5 * 8 + row2] = 1; // Col 5 (h5)
      A_wasm[6 * 8 + row2] = -xs * yd; // Col 6 (h6)
      A_wasm[7 * 8 + row2] = -ys * yd; // Col 7 (h7)
      b_wasm[row2] = yd;
    }

    // 3. Resolver Ah = b usando SVD (asíncrono por WASM)
    const h_vector_wasm = await solveHomographySvdWasm(A_wasm, b_wasm);
    if (!h_vector_wasm || h_vector_wasm.length !== 8) {
      // Comprobar si la solución es válida
      console.error(
        "Homography computation failed: SVD did not return a valid solution vector.",
        h_vector_wasm
      );
      throw new MatrixError(
        "Failed to compute homography: SVD solution is invalid or matrix was singular.",
        "SINGULAR_MATRIX" // O "INTERNAL_ERROR" si el fallo de SVD es inesperado
      );
    }

    // 4. Reconstruir la matriz de homografía normalizada H_norm (3x3) a partir del vector h
    //    h = [h0, h1, h2, h3, h4, h5, h6, h7] (asumiendo este orden de solveHomographySvdWasm)
    //    H_norm = [[h0, h3, h6],
    //              [h1, h4, h7],
    //              [h2, h5, 1 ]]  <- Orden para MatrixUtils.fromValues si espera row-major
    // --- Asegúrate que el orden coincide con `MatrixUtils.fromValues` ---
    const H_norm = MatrixUtils.fromValues(
      h_vector_wasm[0],
      h_vector_wasm[3],
      h_vector_wasm[6], // Fila 0: h00, h01, h02
      h_vector_wasm[1],
      h_vector_wasm[4],
      h_vector_wasm[7], // Fila 1: h10, h11, h12
      h_vector_wasm[2],
      h_vector_wasm[5],
      1.0 // Fila 2: h20, h21, h22=1
    );

    // 5. Desnormalizar: H = T_dst_inv * H_norm * T_src
    //    Necesitamos calcular la inversa de Tdst (síncrono)
    const T_dst_inv = MatrixUtils.inverse(Tdst);
    if (!T_dst_inv) {
      console.error(
        "computeHomographyInternal: Failed to invert Tdst normalization matrix."
      );
      throw new MatrixError(
        "Failed to invert destination normalization matrix Tdst during denormalization.",
        "SINGULAR_MATRIX" // O podría ser un error interno si Tdst nunca debería ser singular
      );
    }

    // Realizar las multiplicaciones (síncronas)
    // tempMatrix = T_dst_inv * H_norm
    const tempMatrix = MatrixUtils.multiply(T_dst_inv, H_norm);
    // H = tempMatrix * T_src
    const H = MatrixUtils.multiply(tempMatrix, Tsrc);

    // La operación sigue siendo async GLOBALMENTE debido a la llamada a solveHomographySvdWasm
    return H;
  }
}
