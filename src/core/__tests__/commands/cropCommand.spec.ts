// src/core/__tests__/commands/cropCommand.spec.ts
import { describe, it, expect, afterEach } from "vitest"; // No necesitamos vi aquí
import { CropCommand } from "../../commands";
import { MatrixUtils } from "../../matrix/MatrixUtils";
import type { Rect } from "../../../types/core.types"; // Ajusta rutas
import { expectMatrixCloseTo } from "../testUtils"; // Importa helper

describe("CropCommand (No Pooling)", () => {
  let rect: Rect;
  let command: CropCommand | undefined;

  afterEach(() => {
    command = undefined;
  });

  it("constructor should clone the input rectangle", () => {
    rect = { x: 10, y: 20, width: 30, height: 40 };
    command = new CropCommand(rect);
    const internalRect = command.getRect();
    expect(internalRect).toEqual(rect);
    expect(internalRect).not.toBe(rect); // Sigue siendo una copia
  });

  it("execute() should return a new identity matrix", () => {
    // Test simplificado
    const initialMatrix = MatrixUtils.translation(5, 5); // Una matriz cualquiera
    rect = { x: 0, y: 0, width: 10, height: 10 };
    command = new CropCommand(rect);

    const resultMatrix = command.execute(initialMatrix); // Ejecutar

    // Verificar que devuelve identidad
    const identity = MatrixUtils.identity();
    expectMatrixCloseTo(resultMatrix, identity);
    expect(resultMatrix).not.toBe(identity); // Debe ser una instancia nueva
    // Ya no verificamos la liberación de initialMatrix
  });

  it("getRect() should return a copy of the internal rectangle", () => {
    rect = { x: 1, y: 2, width: 3, height: 4 };
    command = new CropCommand(rect);
    const r1 = command.getRect();
    const r2 = command.getRect();
    expect(r1).toEqual(rect);
    expect(r2).toEqual(rect);
    expect(r1).not.toBe(r2);
  });

  it("toString() should return a descriptive string", () => {
    rect = { x: 5, y: 15, width: 100, height: 50 };
    command = new CropCommand(rect);
    expect(command.toString()).toBe("Crop to (5, 15, 100×50)");
  });

  it("toJSON() should return correct JSON representation", () => {
    rect = { x: 10, y: 20, width: 30, height: 40 };
    command = new CropCommand(rect);
    const json = command.toJSON();
    expect(json).toEqual({
      type: "crop",
      rect: { x: 10, y: 20, width: 30, height: 40 },
    });
    expect(json.rect).not.toBe(rect);
  });

  it("should throw error for invalid constructor arguments", () => {
    expect(
      () => new CropCommand({ x: 0, y: 0, width: -10, height: 10 }),
    ).toThrowError(/Invalid rectangle/);
    expect(
      () => new CropCommand({ x: 0, y: 0, width: 10, height: 0 }),
    ).toThrowError(/Invalid rectangle/);
    expect(
      () => new CropCommand({ x: NaN, y: 0, width: 10, height: 10 }),
    ).toThrowError(/Invalid rectangle/);
    expect(() => new CropCommand(null as unknown as Rect)).toThrowError(
      /Invalid rectangle/,
    );
  });
});
