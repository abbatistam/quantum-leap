import type { Point, Rect } from "../types/core.types";

/**
 * Verifica si un valor es un número válido y no-NaN.
 * @param {unknown} value - Valor a verificar.
 * @returns {boolean} True si es un número válido.
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Verifica si un objeto tiene las propiedades x e y numéricas.
 * @param {unknown} obj - Objeto a verificar.
 * @returns {boolean} True si es un punto válido.
 */
export function isValidPoint(obj: unknown): obj is Point {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      "x" in obj &&
      "y" in obj &&
      isValidNumber((obj as Point).x) &&
      isValidNumber((obj as Point).y)
  );
}

/**
 * Verifica si un objeto representa un rectángulo válido.
 * @param {unknown} obj - Objeto a verificar.
 * @returns {boolean} True si es un rectángulo válido.
 */
export function isValidRect(obj: unknown): obj is Rect {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      "x" in obj &&
      "y" in obj &&
      "width" in obj &&
      "height" in obj &&
      isValidNumber((obj as Rect).x) &&
      isValidNumber((obj as Rect).y) &&
      isValidNumber((obj as Rect).width) &&
      (obj as Rect).width >= 0 && // <--- CAMBIO AQUÍ
      isValidNumber((obj as Rect).height) &&
      (obj as Rect).height >= 0 // <--- CAMBIO AQUÍ
  );
}
