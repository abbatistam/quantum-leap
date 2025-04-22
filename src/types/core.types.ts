/**
 * Representa un punto en el plano.
 */
export interface Point {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Representación de un rectángulo y sus dimensiones.
 */
export interface Rect extends Point, Dimensions {}

export type Matrix3x3 = Float32Array;
