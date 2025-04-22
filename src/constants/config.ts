/**
 * Configuración global para ajustes matemáticos y de rendimiento.
 */
export const CONFIG = {
  /** Umbral de precisión para comparaciones con cero. */
  EPSILON: 1e-10,
  /** Calidad del suavizado de imagen al redimensionar. */
  IMAGE_SMOOTHING_QUALITY: "high" as ImageSmoothingQuality,
  /** Máximo tamaño del historial de transformaciones. */
  MAX_HISTORY_SIZE: 50,
  MAX_POOL_SIZE: 50,
  MAX_OBJECT_POOL_SIZE: 100,
};

if (CONFIG.MAX_POOL_SIZE < 0) CONFIG.MAX_POOL_SIZE = 0;
if (CONFIG.MAX_OBJECT_POOL_SIZE < 0) CONFIG.MAX_OBJECT_POOL_SIZE = 0;
if (CONFIG.MAX_HISTORY_SIZE < 0) CONFIG.MAX_HISTORY_SIZE = 0;
if (CONFIG.EPSILON <= 0) CONFIG.EPSILON = 1e-10;
