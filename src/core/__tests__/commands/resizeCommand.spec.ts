// src/core/__tests__/commands/resizeCommand.spec.ts
import { describe, it, expect, afterEach } from "vitest";
import { ResizeCommand } from "../../commands";
import { MatrixUtils } from "../../matrix/MatrixUtils";
import { expectMatrixCloseTo } from "../testUtils";

describe("ResizeCommand (No Pooling)", () => {
  let command: ResizeCommand | undefined;

  afterEach(() => {
    command = undefined;
  });

  it("constructor should store dimensions", () => {
    command = new ResizeCommand(200, 150);
    expect(command.getDimensions()).toEqual({ width: 200, height: 150 });
  });

  it("execute() should return a new identity matrix", () => {
    // Test simplificado
    const initialMatrix = MatrixUtils.translation(5, 5); // Matriz cualquiera
    command = new ResizeCommand(100, 100);

    const resultMatrix = command.execute(initialMatrix); // Ejecutar

    // Verificar que devuelve identidad
    const identity = MatrixUtils.identity();
    expectMatrixCloseTo(resultMatrix, identity);

    // Verificar que la instancia devuelta es NUEVA
    expect(resultMatrix).not.toBe(identity);
    expect(resultMatrix).not.toBe(initialMatrix);

    // No hay release
  });

  it("getDimensions() should return the correct dimensions", () => {
    command = new ResizeCommand(300, 400);
    expect(command.getDimensions()).toEqual({ width: 300, height: 400 });
  });

  it("toString() should return a descriptive string", () => {
    command = new ResizeCommand(800, 600);
    expect(command.toString()).toBe("Resize to 800×600");
  });

  it("toJSON() should return correct JSON representation", () => {
    command = new ResizeCommand(1024, 768);
    expect(command.toJSON()).toEqual({
      type: "resize",
      width: 1024,
      height: 768,
    });
  });

  it("should throw error for invalid constructor arguments", () => {
    expect(() => new ResizeCommand(0, 100)).toThrowError(/Invalid width/);
    expect(() => new ResizeCommand(100, -50)).toThrowError(/Invalid height/);
    expect(() => new ResizeCommand(100.5, 100)).toThrowError(/Invalid width/);
    expect(() => new ResizeCommand(100, NaN)).toThrowError(/Invalid height/);
  });
});
