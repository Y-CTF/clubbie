import { Code } from '@clubbie/diag';

/** Every diagnostic the bot raises. */
export const Codes = Code.group('bot', ['start', 'update', 'send']);
