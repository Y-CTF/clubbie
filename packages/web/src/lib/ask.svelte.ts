/**
 * A question the app puts to a member before it does something it cannot take back.
 *
 * `title` is the question itself, `detail` the consequence spelled out, and `confirm` the word on
 * the button that goes through with it. That word is the verb, never "ok": somebody who reads only
 * the buttons should still know which one deletes the season.
 */
export interface Question {
  readonly title: string;
  readonly detail?: string | undefined;
  readonly confirm?: string | undefined;
  /** Whether the act destroys something. Only the colour of the confirming button changes. */
  readonly danger?: boolean;
}

/**
 * One dialog for the whole app, asked for from anywhere.
 *
 * It is a promise rather than a callback prop so a call site reads as the sentence it is:
 * `if (await ask.put({...})) remove()`. There is one at a time, because a second question stacked
 * on the first is a page nobody can answer; asking again retires the first as a no.
 */
class Asking {
  question = $state<Question | null>(null);
  private settle: ((yes: boolean) => void) | null = null;

  put(question: Question): Promise<boolean> {
    this.answer(false);
    this.question = question;
    return new Promise((resolve) => {
      this.settle = resolve;
    });
  }

  /** The answer, from either button, from `Escape`, or from a second question arriving. */
  answer(yes: boolean): void {
    const settle = this.settle;
    this.settle = null;
    this.question = null;
    settle?.(yes);
  }
}

export const ask = new Asking();
