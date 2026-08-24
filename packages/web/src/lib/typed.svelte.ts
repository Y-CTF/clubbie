/**
 * What somebody is typing, and what they have stopped typing.
 *
 * A search box bound straight to a query sends one request per keystroke, which on a roster of two
 * hundred is a scan per keystroke and, on a phone, six requests racing to answer the same box. The
 * box reads `live`, the query reads `settled`, and nothing else changes.
 */
export class Typed {
  /** Long enough to swallow a word being typed, short enough that nobody waits for the list. */
  static readonly DELAY = 250;

  live = $state('');
  settled = $state('');

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly delay: number = Typed.DELAY) {}

  /** Stops a pending settle, for a page that is going away before the member stopped typing. */
  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  set(value: string): void {
    this.live = value;
    if (this.timer !== null) clearTimeout(this.timer);

    /** Clearing the box answers at once: the member wants the whole list back, not in a moment. */
    if (value === '') {
      this.settled = '';
      return;
    }

    this.timer = setTimeout(() => {
      this.settled = value;
      this.timer = null;
    }, this.delay);
  }
}
