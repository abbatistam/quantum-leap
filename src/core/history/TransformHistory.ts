// ======================================
// --- TransformHistory (No Pooling) ---
// ======================================

import { CONFIG } from "../../constants/config";
import { TransformCommand } from "../commands";

/** Manages command history. No longer handles resource cleanup. */
export class TransformHistory {
  private history: TransformCommand[] = [];
  private currentIndex = -1;
  private readonly maxHistorySize: number;

  constructor(maxHistorySize: number = CONFIG.MAX_HISTORY_SIZE) {
    // Keep dependency on CONFIG if needed
    this.maxHistorySize = Math.max(0, maxHistorySize);
  }

  // releaseCommandResources REMOVED

  add(cmd: TransformCommand): void {
    if (!cmd) {
      console.warn("TransformHistory.add: Null/undefined command.");
      return;
    }

    if (this.currentIndex < this.history.length - 1) {
      // Discard redo stack (no resource release needed)
      this.history.splice(this.currentIndex + 1);
    }

    this.history.push(cmd);
    this.currentIndex = this.history.length - 1;

    // Enforce history size (no resource release needed for shifted command)
    if (this.maxHistorySize > 0 && this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }
  }

  canUndo(): boolean {
    return this.currentIndex >= 0;
  }
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }
  undo(): boolean {
    if (!this.canUndo()) return false;
    this.currentIndex--;
    return true;
  }
  redo(): boolean {
    if (!this.canRedo()) return false;
    this.currentIndex++;
    return true;
  }
  getCommands(): TransformCommand[] {
    return this.history.slice(0, this.currentIndex + 1);
  }
  getAllCommandsInternal(): TransformCommand[] {
    return this.history;
  }

  /** Clears history. No resource release needed. */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }
}
