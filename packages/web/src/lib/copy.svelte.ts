/**
 * Putting something on the clipboard, and saying so.
 *
 * The saying so is the whole reason this is a class: a copy button that does nothing visible has
 * been pressed three times by the time anybody trusts it. Two pages wanted the same two lines and
 * the same timeout, which is one definition too few.
 */
export class Copy {
  /** How long the button says it worked before going back to offering to do it again. */
  static readonly SHOWN = 2000;

  done = $state(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  async put(text: string): Promise<void> {
    await navigator.clipboard?.writeText(text);
    this.done = true;

    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.done = false;
      this.timer = null;
    }, Copy.SHOWN);
  }
}
