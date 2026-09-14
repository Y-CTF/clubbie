import { type Code, Diag } from '@clubbie/diag';
import { Codes as StoreCodes } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Codes } from './codes.ts';

/**
 * Every refusal a client can see. The name is what code switches on, the value is what crosses
 * the wire, and the status is beside it rather than in a second table that could disagree.
 */
export const Refusal = {
  Anonymous: 'unauthenticated',
  Forbidden: 'forbidden',
  Missing: 'not_found',
  Invalid: 'invalid',
  Conflict: 'conflict',
  Closed: 'closed',
  Full: 'full',
  Throttled: 'throttled',
  Unavailable: 'unavailable',
} as const;

export type Refusal = (typeof Refusal)[keyof typeof Refusal];

const STATUS = {
  [Refusal.Anonymous]: 401,
  [Refusal.Forbidden]: 403,
  [Refusal.Missing]: 404,
  [Refusal.Invalid]: 422,
  [Refusal.Conflict]: 409,
  [Refusal.Closed]: 409,
  [Refusal.Full]: 409,
  [Refusal.Throttled]: 429,
  [Refusal.Unavailable]: 503,
} as const satisfies Record<Refusal, ContentfulStatusCode>;

export interface Body {
  readonly error: {
    readonly refusal: Refusal;
    readonly message: string;
    /** The diagnostic behind it: code, labels, help. What a UI renders under the message. */
    readonly diag: ReturnType<Diag['toJSON']>;
  };
}

/**
 * A refusal, over the wire and in the log at once. The refusal is what a client switches on; the
 * diagnostic is what a person reads, and it is the same object the console sink draws with
 * carets, so an API 422 and a CLI error are one report in two renderings.
 *
 * A message says what to do next wherever there is something to do: a member whose answer came
 * late wants the deadline, not the word "forbidden".
 */
export class Fail extends HTTPException {
  readonly diag: Diag;
  /** The refusal as JSON. Public so the error handler can render it through the context. */
  readonly body: Body;

  constructor(
    readonly refusal: Refusal,
    diag: Diag,
  ) {
    const body: Body = { error: { refusal, message: diag.message, diag: diag.toJSON() } };
    super(STATUS[refusal], { message: diag.message, res: Response.json(body, { status: STATUS[refusal] }) });
    this.diag = diag;
    this.body = body;
  }

  /** The refusal a route reaches for when it has a diagnostic of its own. */
  static because(refusal: Refusal, diag: Diag): Fail {
    return new Fail(refusal, diag);
  }

  static unauthenticated(message = 'sign in first'): Fail {
    return new Fail(
      Refusal.Anonymous,
      Diag.error(Codes.auth.anonymous, message).help('sign in from the home page, then retry'),
    );
  }

  static forbidden(message = 'not allowed'): Fail {
    return new Fail(
      Refusal.Forbidden,
      Diag.error(Codes.auth.forbidden, message).help('ask an admin to change your role or status'),
    );
  }

  static missing(what: string, code: Code = StoreCodes.missing): Fail {
    return new Fail(Refusal.Missing, Diag.error(code, markup`no such ${what}`));
  }

  /** An invalid request always carries its diagnostic: that is the whole value of the refusal. */
  static invalid(diag: Diag): Fail {
    return new Fail(Refusal.Invalid, diag);
  }

  /** Something moved under the caller between the page they are looking at and the write. */
  static conflict(diag: Diag): Fail {
    return new Fail(Refusal.Conflict, diag);
  }

  /**
   * A refusal hono raised before any route saw the request, turned into one of ours.
   *
   * The framework throws a bare `HTTPException` for the things it checks itself, a malformed JSON
   * body above all. Letting those fall through to "anything else is a bug" answered a client typo
   * with a 503 blaming the server, logged it at `error`, and offered a request id as the next
   * step, which is advice nobody can act on. The status it already chose is the refusal.
   */
  static from(error: HTTPException): Fail {
    const refusal = BY_STATUS[error.status] ?? Refusal.Invalid;
    return new Fail(
      refusal,
      Diag.error(Codes.api.request, markup`${error.message || 'this request could not be read'}`).help(
        refusal === Refusal.Invalid
          ? 'check the request body and send it again'
          : 'check the request and retry',
      ),
    );
  }
}

/**
 * What hono's own statuses mean in this app's vocabulary. Only the ones the framework actually
 * raises are named; anything else it invents is an invalid request, which is what it was.
 */
const BY_STATUS: Partial<Record<number, Refusal>> = {
  400: Refusal.Invalid,
  401: Refusal.Anonymous,
  403: Refusal.Forbidden,
  404: Refusal.Missing,
  413: Refusal.Invalid,
  415: Refusal.Invalid,
  422: Refusal.Invalid,
  429: Refusal.Throttled,
};
