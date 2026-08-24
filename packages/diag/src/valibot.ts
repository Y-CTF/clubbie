import { markup } from '@clubbie/term';
import { Code } from './code.ts';
import { Diag } from './diag.ts';

/** The shape of a valibot issue this bridge reads, kept structural so `diag` needs no dependency. */
export interface Issue {
  readonly message: string;
  readonly path?: readonly { readonly key?: unknown }[] | undefined;
  readonly expected?: string | null | undefined;
  readonly received?: string | undefined;
}

/**
 * Validation failures as one diagnostic pointing into the body that was actually sent.
 *
 * A validator reports a path (`event.startsAt`); the raw text is searched for that key so the
 * caret lands on the value the sender wrote rather than on a path they have to go and decode.
 * Where the key cannot be found, the label degrades to a note rather than pointing somewhere
 * wrong: a caret under an unrelated field is worse than no caret.
 */
export namespace Issues {
  export const Codes = Code.group('input', ['invalid']);

  export function path(issue: Issue): string {
    return (issue.path ?? [])
      .map((step) => String(step.key))
      .filter((step) => step !== 'undefined')
      .join('.');
  }

  export function diag(issues: readonly Issue[], source?: { name: string; text: string }): Diag {
    const first = issues[0];
    const where = first ? path(first) : '';
    const diag = Diag.error(
      Codes.invalid,
      issues.length === 1
        ? markup`\`${where || 'body'}\` is not valid`
        : markup`${issues.length} fields are not valid`,
    );

    if (source) diag.over(source.name, source.text);

    for (const issue of issues) {
      const key = path(issue);
      const needle = `"${key.split('.').pop() ?? ''}"`;
      const said = markup`${issue.message}${expected(issue)}`;
      if (source && key) diag.at(needle, said, issue === first);
      else diag.note(markup`${key || 'body'}: ${issue.message}`);
    }

    return diag.help('check the field against the API schema, then send it again');
  }

  function expected(issue: Issue): string {
    if (!issue.expected) return '';
    return ` (expected ${issue.expected}${issue.received ? `, got ${issue.received}` : ''})`;
  }
}
