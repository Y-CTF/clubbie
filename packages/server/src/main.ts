import { Cli } from './cli.ts';

/** The entry point, and nothing else: everything it does is `Cli`, which tests can call. */
process.exit(await Cli.main());
