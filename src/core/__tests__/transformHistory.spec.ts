// src/core/__tests__/transformHistory.spec.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TransformHistory } from "../history/TransformHistory"; // Ajusta ruta
import { MatrixUtils } from "../matrix/MatrixUtils"; // Para el mock
// Mock simple para TransformCommand SÓLO para estos tests
import type { TransformCommand } from "../commands/TransformCommand"; // Solo para el tipo
import type { Matrix3x3 } from "../../types/core.types";

// Mock simple SÍNCRONO para usar en los tests del historial
const createMockCommand = (name: string): TransformCommand => ({
  name: name,
  // execute puede devolver la identidad o lanzar error si es necesario
  execute: (m: Matrix3x3): Matrix3x3 => MatrixUtils.translation(1, 0), // Devuelve algo diferente a identidad
  toString: () => `MockCmd(${name})`,
  toJSON: () => ({ type: `MockCmd_${name}` }),
});

describe("TransformHistory", () => {
  // Quitar '(No Pooling)' si ya no aplica

  let history: TransformHistory;
  const cmd1 = createMockCommand("cmd1");
  const cmd2 = createMockCommand("cmd2");
  const cmd3 = createMockCommand("cmd3");

  beforeEach(() => {
    history = new TransformHistory(5); // Usar un tamaño máximo para probarlo
  });

  // --- Tests Existentes (Asegúrate de que estén adaptados) ---
  it("should initialize empty", () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getCommands()).toEqual([]);
  });

  it("add should add commands and update index", () => {
    history.add(cmd1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(history.getCommands()).toEqual([cmd1]);

    history.add(cmd2);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(history.getCommands()).toEqual([cmd1, cmd2]);
  });

  it("add should discard redo stack", () => {
    history.add(cmd1);
    history.add(cmd2);
    history.undo(); // Index a cmd1
    expect(history.canRedo()).toBe(true);

    history.add(cmd3); // Añadir nuevo comando debería eliminar cmd2 del historial interno
    expect(history.canRedo()).toBe(false);
    expect(history.getCommands()).toEqual([cmd1, cmd3]);
    // Verificar historial interno (si es necesario para el test)
    expect(history.getAllCommandsInternal()).toEqual([cmd1, cmd3]);
  });

  it("add should enforce max history size", () => {
    const smallHistory = new TransformHistory(2); // Max 2 comandos
    const c1 = createMockCommand("c1");
    const c2 = createMockCommand("c2");
    const c3 = createMockCommand("c3");

    smallHistory.add(c1);
    smallHistory.add(c2);
    expect(smallHistory.getCommands()).toEqual([c1, c2]);
    expect(smallHistory.getAllCommandsInternal()).toEqual([c1, c2]);

    smallHistory.add(c3); // Debería eliminar c1
    expect(smallHistory.getCommands()).toEqual([c2, c3]);
    expect(smallHistory.getAllCommandsInternal()).toEqual([c2, c3]); // c1 se fue
    expect(smallHistory.canUndo()).toBe(true);
  });

  it("undo/redo should change the current index", () => {
    history.add(cmd1);
    history.add(cmd2);
    history.add(cmd3);

    expect(history.getCommands()).toEqual([cmd1, cmd2, cmd3]);
    expect(history.canRedo()).toBe(false);

    history.undo();
    expect(history.getCommands()).toEqual([cmd1, cmd2]);
    expect(history.canRedo()).toBe(true);

    history.undo();
    expect(history.getCommands()).toEqual([cmd1]);
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(history.getCommands()).toEqual([cmd1, cmd2]);
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(history.getCommands()).toEqual([cmd1, cmd2, cmd3]);
    expect(history.canRedo()).toBe(false);
  });

  it("clear should reset the history", () => {
    history.add(cmd1);
    history.add(cmd2);
    history.undo();
    history.clear();

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getCommands()).toEqual([]);
    expect(history.getAllCommandsInternal()).toEqual([]);
  });

  // --- NUEVOS Tests para cubrir líneas 23-25 ---

  it("undo should do nothing and return false if history is empty or at start", () => {
    const emptyHistory = new TransformHistory();
    expect(emptyHistory.canUndo()).toBe(false);
    expect(emptyHistory.undo()).toBe(false); // Verifica retorno
    expect(emptyHistory.getCommands()).toEqual([]); // Sigue vacío

    // Añadir un comando, pero aún no se puede deshacer (currentIndex es 0, pero no hay nada antes)
    // Corrección: si hay 1 elemento, sí se puede deshacer (para ir a -1)
    // Probemos con un historial con un elemento, y luego deshecho.
    history.add(cmd1);
    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(true); // Ahora index es -1
    expect(history.canUndo()).toBe(false); // Ahora no se puede deshacer
    expect(history.undo()).toBe(false); // Llamar de nuevo devuelve false
    expect(history.getCommands()).toEqual([]); // El estado actual es vacío
  });

  it("redo should do nothing and return false if history is empty or at the end", () => {
    const emptyHistory = new TransformHistory();
    expect(emptyHistory.canRedo()).toBe(false);
    expect(emptyHistory.redo()).toBe(false); // Verifica retorno

    // Añadir comandos
    history.add(cmd1);
    history.add(cmd2);
    expect(history.canRedo()).toBe(false); // Ya está al final
    expect(history.redo()).toBe(false); // Llamar devuelve false

    // Deshacer una vez
    history.undo();
    expect(history.canRedo()).toBe(true);
    expect(history.redo()).toBe(true); // Rehace a cmd2
    expect(history.canRedo()).toBe(false); // De nuevo al final
    expect(history.redo()).toBe(false); // Llamar de nuevo devuelve false
  });

  it("add should handle null/undefined command and warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const initialCommands = history.getCommands();

    history.add(null as any);
    expect(warnSpy).toHaveBeenCalledWith(
      "TransformHistory.add: Null/undefined command."
    );
    expect(history.getCommands()).toEqual(initialCommands); // No debe cambiar

    history.add(undefined as any);
    expect(warnSpy).toHaveBeenCalledWith(
      "TransformHistory.add: Null/undefined command."
    );
    expect(history.getCommands()).toEqual(initialCommands); // No debe cambiar

    warnSpy.mockRestore();
  });
});
