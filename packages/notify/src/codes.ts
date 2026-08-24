import { Code } from '@clubbie/diag';

/** Every diagnostic a delivery raises, declared once so no channel writes a code literal. */
export const Codes = Code.group('notify', ['email', 'chat']);
