import { Code } from '@clubbie/diag';

/**
 * Every diagnostic the API raises, grouped by the area it comes from. A code is declared here and
 * nowhere else, so the set a client can switch on is one file, and a throw site cannot invent one
 * by typing a string.
 */
export const Codes = {
  /**
   * Sign-in codes the API itself raises. What goes wrong *inside* sign-in is `@clubbie/auth`'s to
   * name, and the two tables share a namespace, so nothing may be declared in both: a client that
   * switched on `auth.provider` could not tell which table it came from.
   */
  auth: Code.group('auth', ['anonymous', 'forbidden', 'refused', 'callback', 'state']),
  rsvp: Code.group('rsvp', ['closed', 'state', 'full']),
  season: Code.group('season', ['range', 'closed']),
  event: Code.group('event', ['state', 'capacity', 'guest']),
  schedule: Code.group('schedule', ['rule', 'range']),
  club: Code.group('club', ['colour']),
  asset: Code.group('asset', ['type', 'size', 'empty']),
  member: Code.group('member', ['nothing']),
  kind: Code.group('kind', ['unknown', 'slug', 'taken', 'used', 'last', 'many']),
  feed: Code.group('feed', ['token']),
  job: Code.group('job', ['missing', 'state']),
  api: Code.group('api', ['unhandled', 'throttled']),
} as const;
