// src/utils/serialize.ts

import {
  CropCommand,
  CustomTransformCommand,
  PerspectiveCommand,
  ResizeCommand,
  RotateCommand,
  ScaleCommand,
  SkewCommand,
  TranslateCommand,
  type TransformCommand,
  // Quita MatrixUtils si ya no se usa aquí directamente
} from "../core/commands"; // Ajusta ruta
import { isValidPoint, isValidRect } from "./utils"; // Asume que existe
import type { Point, Rect, Matrix3x3 } from "../types/core.types"; // Ajusta ruta

/**
 * Deserializa un objeto JSON genérico en una instancia de TransformCommand. (ASÍNCRONO)
 * @param {unknown} data - El objeto JSON (parseado) a deserializar.
 * @returns {Promise<TransformCommand>} Una promesa que resuelve a la instancia del comando.
 * @throws {Error} Si el tipo de comando es desconocido o los datos son inválidos (puede lanzar síncrono o rechazar promesa).
 */
export async function deserializeCommand(
  data: unknown,
): Promise<TransformCommand> {
  // async + Promise
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid command data: input is not an object.");
  }
  if (!("type" in data) || typeof data.type !== "string") {
    throw new Error(
      'Invalid command data: "type" property is missing or not a string.',
    );
  }

  // Los comandos que NO requieren async se pueden devolver directamente (envueltos en Promise por ser async fn)
  switch (data.type) {
    case "rotate": {
      if (!("angle" in data) || typeof data.angle !== "number")
        throw new Error("Invalid rotate data: angle");
      const center = "center" in data ? data.center : undefined;
      if (center !== undefined && !isValidPoint(center))
        throw new Error("Invalid rotate data: center");
      // Devolver síncrono (se envuelve en Promise automáticamente)
      return new RotateCommand(data.angle, center as Point | undefined);
    }
    case "scale": {
      if (!("sx" in data) || typeof data.sx !== "number")
        throw new Error("Invalid scale data: sx");
      if (!("sy" in data) || typeof data.sy !== "number")
        throw new Error("Invalid scale data: sy");
      const center = "center" in data ? data.center : undefined;
      if (center !== undefined && !isValidPoint(center))
        throw new Error("Invalid scale data: center");
      // Devolver síncrono
      return new ScaleCommand(data.sx, data.sy, center as Point | undefined);
    }
    case "translate": {
      if (!("dx" in data) || typeof data.dx !== "number")
        throw new Error("Invalid translate data: dx");
      if (!("dy" in data) || typeof data.dy !== "number")
        throw new Error("Invalid translate data: dy");
      // Devolver síncrono
      return new TranslateCommand(data.dx, data.dy);
    }
    case "crop": {
      if (!("rect" in data) || !isValidRect(data.rect))
        throw new Error("Invalid crop data: rect");
      // Devolver síncrono
      return new CropCommand(data.rect as Rect);
    }
    case "resize": {
      if (
        !("width" in data) ||
        typeof data.width !== "number" ||
        !Number.isInteger(data.width)
      )
        throw new Error("Invalid resize data: width");
      if (
        !("height" in data) ||
        typeof data.height !== "number" ||
        !Number.isInteger(data.height)
      )
        throw new Error("Invalid resize data: height");
      // Devolver síncrono
      return new ResizeCommand(data.width, data.height);
    }
    case "skew": {
      if (!("skewX" in data) || typeof data.skewX !== "number")
        throw new Error("Invalid skew data: skewX");
      if (!("skewY" in data) || typeof data.skewY !== "number")
        throw new Error("Invalid skew data: skewY");
      // Devolver síncrono
      return new SkewCommand(data.skewX, data.skewY);
    }
    case "custom": {
      const validateMatrixArray = (arr: unknown): arr is number[] =>
        Array.isArray(arr) &&
        arr.length === 9 &&
        arr.every((n) => typeof n === "number");
      if (!("matrix" in data) || !validateMatrixArray(data.matrix))
        throw new Error("Invalid custom data: matrix");
      if (!("desc" in data) || typeof data.desc !== "string")
        throw new Error("Invalid custom data: desc");
      const mat = new Float32Array(data.matrix) as Matrix3x3;
      // Devolver síncrono
      return new CustomTransformCommand(mat, data.desc);
    }

    // --- Perspective AHORA ES ASÍNCRONO ---
    case "perspective": {
      const validatePointArray = (arr: unknown): arr is Point[] =>
        Array.isArray(arr) && arr.length === 4 && arr.every(isValidPoint);
      if (!("sourcePoints" in data) || !validatePointArray(data.sourcePoints))
        throw new Error("Invalid perspective data: sourcePoints");
      if (!("destPoints" in data) || !validatePointArray(data.destPoints))
        throw new Error("Invalid perspective data: destPoints");
      const srcTuple = data.sourcePoints as [Point, Point, Point, Point];
      const dstTuple = data.destPoints as [Point, Point, Point, Point];
      // LLAMAR AL MÉTODO ESTÁTICO ASÍNCRONO
      try {
        // ¡Necesita await! La función entera ya es async.
        return await PerspectiveCommand.create(srcTuple, dstTuple);
      } catch (err) {
        // Re-lanzar el error si create falla, para que la promesa sea rechazada
        console.error(
          "Failed to create PerspectiveCommand during deserialization:",
          err,
        );
        throw new Error(
          `Failed to deserialize perspective command: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    default:
      // Lanzar error síncrono para tipos desconocidos
      throw new Error(`Unknown command type: "${data.type}"`);
  }
}

/**
 * Serializa una secuencia de comandos a una cadena JSON. (Sigue síncrono)
 * @param {TransformCommand[]} commands - Array de comandos.
 * @returns {string} La representación JSON de la secuencia.
 */
export function serializeCommandSequence(commands: TransformCommand[]): string {
  return JSON.stringify(commands, null, 2);
}

/**
 * Deserializa una cadena JSON en una secuencia de comandos. (ASÍNCRONO)
 * @param {string} jsonString - La cadena JSON a deserializar.
 * @returns {Promise<TransformCommand[]>} Una promesa que resuelve al array de comandos reconstruidos.
 * @throws {Error} Si el JSON es inválido o contiene datos de comando incorrectos (puede lanzar síncrono o rechazar promesa).
 */
export async function deserializeCommandSequence(
  jsonString: string,
): Promise<TransformCommand[]> {
  // async + Promise
  let dataArray: unknown[];
  try {
    dataArray = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(
      `Invalid JSON string: ${e instanceof Error ? e.message : e}`,
    );
  }

  if (!Array.isArray(dataArray)) {
    throw new Error("Invalid JSON sequence: input is not an array.");
  }

  // Mapear y esperar todas las promesas de deserialización
  const commandPromises = dataArray.map((data) => deserializeCommand(data));
  // Promise.all espera a que todas las promesas se resuelvan
  // Si alguna promesa falla (es rechazada), Promise.all fallará también.
  return Promise.all(commandPromises);
}
