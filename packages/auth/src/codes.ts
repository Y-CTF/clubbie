import { Code } from '@clubbie/diag';

/**
 * Every diagnostic sign-in raises. A failed sign-in is the one error an ordinary member will hit
 * before they can reach anything else, so each of these names what to do next rather than
 * reaching the caller as a bare `Error` and being reported as a server fault.
 */
export const Codes = Code.group('auth', [
  'provider',
  'discovery',
  'exchange',
  'claims',
  'unverified',
  'profile',
  'organisation',
  /** A sign-in link or code that is spent, timed out, or guessed at too often. */
  'expired',
]);
