/**
 * What the app says after it has done something: "saved", and nothing more.
 *
 * A write that works used to change nothing visible, which is indistinguishable from a button
 * that did not fire. A toast is the smallest acknowledgement that is not a dialog: it appears,
 * stays long enough to read, and goes without asking to be dismissed.
 */
export class Toasts {
  static readonly LIFE = 3500;
  /** A toast that offers an undo stays long enough to decide. */
  static readonly UNDOABLE = 7000;

  items = $state<{ id: number; text: string; undo?: () => void }[]>([]);
  private next = 0;

  say(text: string, undo?: () => void): void {
    const id = this.next++;
    this.items = [...this.items, undo ? { id, text, undo } : { id, text }];
    setTimeout(() => this.drop(id), undo ? Toasts.UNDOABLE : Toasts.LIFE);
  }

  drop(id: number): void {
    this.items = this.items.filter((one) => one.id !== id);
  }
}

export const toast = new Toasts();
