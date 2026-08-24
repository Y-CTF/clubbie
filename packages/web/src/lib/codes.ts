import { Code } from '@clubbie/diag';

/**
 * The two failures the browser can report that the server never did: it could not be reached, and
 * something in the page itself threw. Both are diagnostics so one component renders every error.
 */
export const Codes = Code.group('web', ['unreachable', 'unknown']);
