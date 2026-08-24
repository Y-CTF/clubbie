import { Code } from '@clubbie/diag';

/** Every diagnostic the server and its CLI raise. */
export const Codes = {
  config: Code.group('config', ['port', 'secret', 'baseUrl', 'provider', 'email']),
  cli: Code.group('cli', ['command', 'admin', 'backup']),
  job: Code.group('job', ['failed']),
  bot: Code.group('bot', ['start']),
} as const;
