import { type Refused, refused } from './api.ts';

/**
 * One write, as reactive state: whether anything is in flight, and the refusal if one came back.
 *
 * It exists because every page did the same three lines around a mutation, and the interesting
 * case (a full event, a passed deadline, a role that is not allowed) is exactly the one those
 * three lines kept dropping.
 *
 * `busy` counts rather than flags. A page shares one of these across every write on it, so with a
 * boolean the first write to finish cleared it while the second was still going, and the buttons
 * came back mid-flight: tapping "mark present" and then "add guest" on a slow connection added
 * the guest twice.
 */
export class Action {
  private running = $state(0);
  error = $state<Refused | null>(null);

  get busy(): boolean {
    return this.running > 0;
  }

  /**
   * Runs the write and answers what it returned, or `null` when it was refused.
   *
   * The answer used to be a boolean, which meant a caller who needed the value had to smuggle it
   * out of the closure into a variable the compiler could then only see as `null`. Returning it
   * is the same information without the lie.
   */
  async run<T>(write: () => Promise<T>): Promise<T | null> {
    this.running += 1;
    this.error = null;

    try {
      return await write();
    } catch (error) {
      this.error = refused(error);
      return null;
    } finally {
      this.running -= 1;
    }
  }

  clear(): void {
    this.error = null;
  }
}
