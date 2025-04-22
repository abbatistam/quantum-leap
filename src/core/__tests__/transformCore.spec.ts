import { describe, it, expect, beforeEach, vi } from "vitest";
import { TransformCore } from "../TransformCore"; // Adjust path if needed
import { MatrixUtils } from "../matrix/MatrixUtils"; // Adjust path if needed
import {
  TranslateCommand,
  CropCommand,
  ResizeCommand,
  TransformCommand,
  ScaleCommand,
  DimensionCommand,
} from "../commands"; // Adjust path if needed

import type { Matrix3x3, Point, Rect } from "../../types/core.types"; // Adjust path
import {
  expectMatrixCloseTo,
  expectPointCloseTo,
  expectRectCloseTo,
} from "./testUtils"; // Adjust path

describe("TransformCore (Async Apply)", () => {
  let core: TransformCore | undefined;
  const initialWidth = 100;
  const initialHeight = 50;
  const defaultTolerance = 1e-6; // Define default tolerance

  beforeEach(() => {
    core = new TransformCore(initialWidth, initialHeight);
  });

  it("constructor should initialize with dimensions and identity matrix", () => {
    expect(core).toBeDefined();
    expect(core?.getDimensions()).toEqual({
      width: initialWidth,
      height: initialHeight,
    });
    const m = core!.getMatrix();
    expectMatrixCloseTo(m, MatrixUtils.identity(), defaultTolerance); // Use MatrixUtils.identity() for clarity
  });

  it("constructor should throw error for invalid dimensions", () => {
    expect(() => new TransformCore(0, 100)).toThrow(/Initial width/);
    expect(() => new TransformCore(100, -50)).toThrow(/Initial height/);
    expect(() => new TransformCore(100.5, 100)).toThrow(/Initial width/);
  });

  it("setMatrix should update the internal matrix", () => {
    const newMatrix = MatrixUtils.translation(10, 5);
    core!.setMatrix(newMatrix);
    const currentMatrix = core!.getMatrix();
    expectMatrixCloseTo(currentMatrix, newMatrix, defaultTolerance);
    expect(core!["matrix"]).not.toBe(newMatrix); // Check it's a clone
  });

  it("setMatrix should ignore invalid matrix input and log error", () => {
    const originalMatrix = core!.getMatrix();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    core!.setMatrix(null as any);
    const currentMatrix = core!.getMatrix();
    expect(errorSpy).toHaveBeenCalledWith(
      "TransformCore.setMatrix: Invalid matrix. State not changed.",
      null
    );
    expectMatrixCloseTo(currentMatrix, originalMatrix, defaultTolerance); // Compare values
    errorSpy.mockRestore();
  });

  it("setDimensions should update dimensions", () => {
    const newDims = { width: 200, height: 150 };
    core!.setDimensions(newDims);
    expect(core!.getDimensions()).toEqual(newDims);
  });

  it("setDimensions should warn on invalid dimensions", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const invalidDims = { width: -10, height: 100 };
    const initialDims = core!.getDimensions();
    core!.setDimensions(invalidDims);
    expect(warnSpy).toHaveBeenCalledWith(
      "TransformCore.setDimensions: Invalid dimensions.",
      invalidDims
    );
    expect(core!.getDimensions()).toEqual(initialDims);
    warnSpy.mockRestore();
  });

  // --- Tests requiring await ---

  it("applyCommand should update the matrix", async () => {
    // <-- async
    const dx = 10,
      dy = 20;
    const cmd = new TranslateCommand(dx, dy);
    const initialMatrix = core!.getMatrix();

    // In TranslateCommand.execute: result = multiply(translation(dx, dy), inputMatrix)
    const translationMatrix = MatrixUtils.translation(dx, dy);
    const expectedMatrix = MatrixUtils.multiply(
      translationMatrix,
      initialMatrix
    );

    await core!.applyCommand(cmd); // <-- await

    const finalMatrix = core!.getMatrix();
    expectMatrixCloseTo(finalMatrix, expectedMatrix, defaultTolerance);
  });

  it("applyCommand should update dimensions for DimensionCommands", async () => {
    // <-- async
    const newWidth = 300;
    const newHeight = 250;
    const cmd = new ResizeCommand(newWidth, newHeight); // Resize resets matrix to identity

    await core!.applyCommand(cmd); // <-- await

    const finalMatrix = core!.getMatrix();
    expectMatrixCloseTo(finalMatrix, MatrixUtils.identity(), defaultTolerance);
    expect(core!.getDimensions()).toEqual({
      // Check dimensions AFTER await
      width: newWidth,
      height: newHeight,
    });
  });

  it("applyCommand should handle commands that reset the matrix (Crop, Resize)", async () => {
    // <-- async
    await core!.applyCommand(new TranslateCommand(50, 50)); // <-- await setup
    const matrixBefore = core!.getMatrix(); // Should be T(50,50)

    const cropRect = { x: 10, y: 10, width: 20, height: 20 };
    const cmd = new CropCommand(cropRect); // Crop resets matrix to identity

    await core!.applyCommand(cmd); // <-- await the command that resets

    const finalMatrix = core!.getMatrix();
    const identityMatrix = MatrixUtils.identity();

    expectMatrixCloseTo(finalMatrix, identityMatrix, defaultTolerance); // Verify it's identity
    // Check if it actually changed from the previous state (T(50,50))
    // Use expectMatrixCloseTo with a *negative* check (i.e., expect diff > tolerance)
    // or simply check that they are not element-wise equal
    let matricesAreDifferent = false;
    for (let i = 0; i < 9; i++) {
      if (Math.abs(finalMatrix[i] - matrixBefore[i]) > defaultTolerance) {
        matricesAreDifferent = true;
        break;
      }
    }
    expect(matricesAreDifferent).toBe(true); // Assert they are indeed different

    // expect(finalMatrix).not.toEqual(matrixBefore); // <-- This might fail due to floating point issues if matrixBefore was close to identity
  });

  it("applyCommand should handle errors during command execution and reset matrix", async () => {
    // <-- async
    const errorCmd: TransformCommand = {
      name: "error",
      execute: (m: Matrix3x3) => {
        // Make execute async if it mimics async operations
        // Simulate async work
        throw new Error("Command execution failed!");
      },
      toString: () => "ErrorCommand",
      toJSON: () => ({ type: "error" as any }),
    };

    await core!.applyCommand(new TranslateCommand(1, 1)); // <-- await setup
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // applyCommand catches the error internally, so it shouldn't throw outwards
    await core!.applyCommand(errorCmd); // <-- await the failing command

    // Assertions run AFTER the internal catch block has executed
    expect(errorSpy).toHaveBeenCalledWith(
      "Error executing command 'error'. Resetting matrix to identity.",
      expect.any(Error)
    );

    const finalMatrix = core!.getMatrix();
    expectMatrixCloseTo(finalMatrix, MatrixUtils.identity(), defaultTolerance); // Should reset to identity

    errorSpy.mockRestore();
  });

  it("resetMatrix should reset to identity", () => {
    // <-- No async needed here
    core!.applyCommand(new TranslateCommand(10, 10)); // applyCommand is async, but we don't wait here, just modify state
    // For the purpose of testing resetMatrix, we don't *need* to wait for the above,
    // but it's safer if the modification is awaited if subsequent actions depended on it.
    // Let's await for robustness, though not strictly necessary for *this* test's logic.
    // await core!.applyCommand(new TranslateCommand(10, 10));
    core!.resetMatrix(); // resetMatrix is synchronous
    const m = core!.getMatrix();
    expectMatrixCloseTo(m, MatrixUtils.identity(), defaultTolerance);
  });

  it("transformPoint should apply the core matrix", async () => {
    // <-- async
    await core!.applyCommand(new TranslateCommand(5, -5)); // <-- await the state change
    const p = { x: 10, y: 10 };
    const expected = { x: 15, y: 5 };
    const transformed = core!.transformPoint(p); // transformPoint itself is sync
    expectPointCloseTo(transformed, expected, defaultTolerance);
  });

  it("transformPoint should handle invalid point and log error", () => {
    // <-- No async needed
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = core!.transformPoint(null as any);
    expect(errorSpy).toHaveBeenCalledWith(
      "TransformCore.transformPoint: Invalid input point.",
      null
    );
    expect(result.x).toBeNaN();
    expect(result.y).toBeNaN();
    errorSpy.mockRestore();
  });

  it("transformRect should apply the core matrix", async () => {
    // <-- async
    await core!.applyCommand(new ScaleCommand(2, 0.5)); // <-- await the state change
    const r = { x: 10, y: 10, width: 20, height: 30 };
    // Expected: x'=2*10=20, y'=0.5*10=5, w'=2*20=40, h'=0.5*30=15
    const expected = { x: 20, y: 5, width: 40, height: 15 };
    const transformed = core!.transformRect(r); // transformRect itself is sync
    // Need slightly more tolerance for rect transforms due to multiple points
    expectRectCloseTo(transformed, expected, defaultTolerance);
  });

  it("transformRect should handle invalid rect and log error", () => {
    // <-- No async needed
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = core!.transformRect(null as any);
    expect(errorSpy).toHaveBeenCalledWith(
      "TransformCore.transformRect: Invalid input rect.",
      null
    );
    expect(result.x).toBeNaN();
    expect(result.y).toBeNaN();
    expect(result.width).toBeNaN();
    expect(result.height).toBeNaN();
    errorSpy.mockRestore();
  });

  it("applyCommand should handle errors from getDimensions", async () => {
    // <-- async
    const errorMsg = "Failed to get dimensions";
    const errorDimCmd: DimensionCommand = {
      name: "errorDim",
      // Make execute async to match applyCommand signature expectation
      execute: (m: Matrix3x3) => m,
      getDimensions: () => {
        // getDimensions itself can remain sync
        throw new Error(errorMsg);
      },
      toString: () => "ErrorDimCmd",
      toJSON: () => ({ type: "errorDim" as any }),
    };

    const initialDims = core!.getDimensions();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await core!.applyCommand(errorDimCmd); // <-- await

    // Assertions run after await completes (and internal catch runs)
    expect(errorSpy).toHaveBeenCalledWith(
      "Error executing command 'errorDim'. Resetting matrix to identity.",
      expect.objectContaining({ message: errorMsg })
    );
    expect(core!.getDimensions()).toEqual(initialDims); // Dimensions shouldn't change on error

    errorSpy.mockRestore();
  });

  it("applyCommand should warn on invalid dimensions returned by command", async () => {
    // <-- async
    const invalidDimCmd: DimensionCommand = {
      name: "invalidDim",
      // Make execute async to match applyCommand signature expectation
      execute: (m: Matrix3x3) => m,
      getDimensions: () => ({ width: NaN, height: 100 }), // sync getDimensions is fine
      toString: () => "InvalidDimCmd",
      toJSON: () => ({ type: "invalidDim" as any }),
    };

    const initialDims = core!.getDimensions();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await core!.applyCommand(invalidDimCmd); // <-- await

    // Assertions run after await completes
    expect(warnSpy).toHaveBeenCalledWith(
      "Command 'invalidDim' returned invalid dimensions."
    );
    expect(core!.getDimensions()).toEqual(initialDims); // Dimensions shouldn't change on warning

    warnSpy.mockRestore();
  });
});
