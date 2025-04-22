export interface ITransformError extends Error {
  /** Código de error estandarizado. */
  code: string;
}

/**
 * Error específico para operaciones con matrices.
 * Implementa la interfaz {@link ITransformError}.
 */
export class MatrixError extends Error implements ITransformError {
  public code: string;

  /**
   * Crea una instancia de MatrixError.
   * @param {string} message - Mensaje de error.
   * @param {string} [code='MATRIX_ERROR'] - Código del error.
   */
  constructor(message: string, code: string = "MATRIX_ERROR") {
    super(message);
    this.name = "MatrixError";
    this.code = code;
  }
}

/**
 * Error específico para operaciones de imagen.
 * Implementa la interfaz {@link ITransformError}.
 */
export class ImageTransformError extends Error implements ITransformError {
  public code: string;

  /**
   * Crea una instancia de ImageTransformError.
   * @param {string} message - Mensaje de error.
   * @param {string} [code='IMAGE_TRANSFORM_ERROR'] - Código del error.
   */
  constructor(message: string, code: string = "IMAGE_TRANSFORM_ERROR") {
    super(message);
    this.name = "ImageTransformError";
    this.code = code;
  }
}
