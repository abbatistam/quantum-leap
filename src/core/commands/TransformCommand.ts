import { BaseCommandJSON } from "../../types/commands.types";
import { Dimensions, Matrix3x3 } from "../../types/core.types";

export interface TransformCommand {
  readonly name: string;
  /**
   * Executes the command's transformation logic.
   * Typically returns a *new* matrix representing the state *after* the command.
   * The input matrix provided is usually discarded (garbage collected).
   * Crop/Resize might return a new identity matrix.
   * @param {Matrix3x3} matrix - The current transformation matrix *before* this command.
   * @returns {Matrix3x3} The transformation matrix *after* this command has been applied (a new instance).
   */
  execute(matrix: Matrix3x3): Matrix3x3;
  toString(): string;
  toJSON(): BaseCommandJSON;
  // releaseResources method REMOVED
}

export interface DimensionCommand extends TransformCommand {
  getDimensions(): Dimensions;
}

export function isDimensionCommand(
  cmd: TransformCommand
): cmd is DimensionCommand {
  return cmd && typeof (cmd as DimensionCommand).getDimensions === "function";
}
