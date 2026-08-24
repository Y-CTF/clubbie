import { Code } from '@clubbie/diag';

/** Every diagnostic the store raises, declared once so no throw site writes a code literal. */
export const Codes = Code.group('store', ['url', 'migration', 'missing', 'conflict', 'payload', 'identity']);
