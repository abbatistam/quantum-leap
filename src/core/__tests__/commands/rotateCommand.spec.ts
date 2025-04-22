import { describe, it, expect } from "vitest";
import { RotateCommand } from "../../commands";
import { MatrixUtils } from "../../matrix/MatrixUtils";
import type { Point } from "../../../types/core.types";
import { expectMatrixCloseTo } from "../testUtils";

describe("RotateCommand (No Pooling)", () => {
  // Ya no necesitamos variables globales aquí
  // let initialMatrix: Matrix3x3 | undefined;
  // let command: RotateCommand | undefined;

  // afterEach eliminado

  it("execute() should apply rotation correctly (no center)", () => {
    const initialMatrix = MatrixUtils.translation(10, 5); // Matriz base (nueva)
    const angle = Math.PI / 2; // 90 grados
    const command = new RotateCommand(angle);

    // Calcular matrices esperadas (nuevas)
    const expectedRotateMatrix = MatrixUtils.rotation(angle);
    const expectedResult = MatrixUtils.multiply(
      expectedRotateMatrix,
      initialMatrix,
    ); // R * M

    // Ejecutar
    const resultMatrix = command.execute(initialMatrix); // Devuelve nueva matriz

    // Comparar
    expectMatrixCloseTo(resultMatrix, expectedResult);

    // No hay release
  });

  it("execute() should apply rotation around a center correctly", () => {
    const initialMatrix = MatrixUtils.scaling(2, 1); // Matriz base (nueva)
    const center: Point = { x: 5, y: 10 };
    const angle = Math.PI; // 180 grados
    const command = new RotateCommand(angle, center);

    // Calcular matrices esperadas (nuevas)
    const expectedRotateMatrix = MatrixUtils.rotationAround(angle, center);
    const expectedResult = MatrixUtils.multiply(
      expectedRotateMatrix,
      initialMatrix,
    ); // Ra * M

    // Ejecutar
    const resultMatrix = command.execute(initialMatrix); // Devuelve nueva matriz

    // Comparar
    expectMatrixCloseTo(resultMatrix, expectedResult);

    // No hay release
  });

  it("toString() should return a descriptive string (no center)", () => {
    const angle = Math.PI / 3;
    const command = new RotateCommand(angle);
    expect(command.toString()).toBe("Rotate 60.0°");
  });

  it("toString() should return a descriptive string (with center)", () => {
    const angle = -Math.PI / 4;
    const command = new RotateCommand(angle, { x: 100, y: 50 });
    expect(command.toString()).toBe("Rotate -45.0° around (100.0,50.0)");
  });

  it("toJSON() should return correct JSON representation (no center)", () => {
    const angle = Math.PI;
    const command = new RotateCommand(angle);
    expect(command.toJSON()).toEqual({
      type: "rotate",
      angle: angle,
    });
  });

  it("toJSON() should return correct JSON representation (with center)", () => {
    const angle = Math.PI / 6;
    const center: Point = { x: -5, y: 15 };
    const command = new RotateCommand(angle, center);
    const json = command.toJSON();
    expect(json).toEqual({
      type: "rotate",
      angle: angle,
      center: { x: -5, y: 15 },
    });
    expect(json.center).not.toBe(center);
  });

  it("should throw error for invalid constructor arguments", () => {
    expect(() => new RotateCommand(NaN)).toThrowError(/Invalid angle/);
    expect(() => new RotateCommand(Infinity)).toThrowError(/Invalid angle/);
    expect(() => new RotateCommand(0, { x: 1, y: NaN })).toThrowError(
      /Invalid center/,
    );
  });
});
