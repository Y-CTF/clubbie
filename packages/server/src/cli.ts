import { Brand, Member } from '@clubbie/core';
import { Diag, Render } from '@clubbie/diag';
import { Members, Store } from '@clubbie/store';
import { markup, Paint, Rows } from '@clubbie/term';
import { sql } from 'kysely';
import { App } from './app.ts';
import { Codes } from './codes.ts';
import { Config } from './config.ts';
import { Runtime, type Stop } from './runtime.ts';
import { Scheduler } from './scheduler.ts';
import { Seed } from './seed.ts';

/**
 * One binary, a handful of verbs. The table below is the only statement of what they are: usage,
 * dispatch and the "did you mean" note all read it, so a command cannot exist in the help and
 * not in the switch.
 *
 * Anything that fails is rendered as a diagnostic against the input that caused it, so a bad
 * `DATABASE_URL` underlines the variable rather than printing a stack trace at somebody who has
 * never seen this codebase.
 */
export interface Command {
  readonly args: readonly string[];
  readonly blurb: string;
  run(config: Config, args: readonly string[]): Promise<number>;
}

export namespace Cli {
  export const NAME = Brand.cli;
  export const HELP = ['help', '--help', '-h'] as const;
  export const DEFAULT = 'serve';
  /** How many batches one `work` pass drains before it stops, so cron cannot run for ever. */
  export const PASSES = 20;

  export const COMMANDS = {
    serve: { args: [], blurb: 'run the api, the web app and the scheduler (default)', run: serve },
    migrate: { args: [], blurb: 'apply pending schema migrations, then exit', run: migrate },
    seed: { args: [], blurb: 'fill an empty database with development data', run: seed },
    admin: { args: ['email'], blurb: 'make an existing member an admin', run: admin },
    backup: { args: ['path'], blurb: 'copy the database to a file, safely, while it runs', run: backup },
    work: { args: [], blurb: 'run one pass of the job queue, then exit', run: work },
  } as const satisfies Record<string, Command>;

  export type Name = keyof typeof COMMANDS;

  export function known(name: string): name is Name {
    return name in COMMANDS;
  }

  export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
    const paint = Paint.detect();
    const [command = DEFAULT, ...rest] = argv;

    if (HELP.includes(command as (typeof HELP)[number])) {
      process.stdout.write(`${help(paint)}\n`);
      return 0;
    }

    try {
      if (!known(command)) {
        throw Diag.error(Codes.cli.command, markup`\`${command}\` is not a ${NAME} command`)
          .note(markup`known: ${Object.keys(COMMANDS).join(', ')}`)
          .help(markup`run \`${NAME} help\``);
      }
      return await COMMANDS[command].run(Config.read(), rest);
    } catch (error) {
      process.stderr.write(`${Render.text(Diag.of(error, Codes.cli.command), paint)}\n`);
      return 1;
    }
  }

  /** Usage, rendered from the same table `main` dispatches on. */
  export function help(paint: Paint): string {
    const commands = new Rows(['left', 'left']);
    for (const [name, command] of Object.entries(COMMANDS) as [Name, Command][]) {
      const args = command.args.map((arg) => `<${arg}>`).join(' ');
      commands.push(paint.cyan(`${name} ${args}`.trim()), paint.grey(command.blurb));
    }

    const vars = new Rows(['left', 'left']);
    for (const [key, name] of Object.entries(Config.VARS)) {
      const fallback = Config.DEFAULTS[key as keyof typeof Config.DEFAULTS];
      vars.push(paint.cyan(name), paint.grey(fallback === undefined ? '' : String(fallback)));
    }

    return [
      `${paint.bold(NAME)} ${paint.grey('- club manager for small associations')}`,
      '',
      `${paint.bold('usage')}: ${NAME} <command>`,
      '',
      commands.render(),
      '',
      `${paint.bold('environment')} ${paint.grey('(name, default)')}`,
      vars.render(),
    ].join('\n');
  }

  async function serve(config: Config): Promise<number> {
    const { app, store, log } = await App.wire(config);
    const bot = await App.telegram(config, store, log);
    const notify = App.channels(config, store, log, bot);
    const scheduler = await App.scheduler(config, store, notify, log);

    /**
     * Registered before anything is listening, so a signal during boot closes what is already open
     * rather than taking the default action with a store and a half-started bot behind it.
     */
    let stop: Stop = async () => {};
    Runtime.onShutdown(async () => {
      await stop();
      await scheduler.stop();
      await bot?.stop();
      await store.close();
    }, log);

    stop = await Runtime.listen(app, config.port, log);
    log.info('listening', {
      url: `http://localhost:${config.port}`,
      base: config.baseUrl,
      database: Store.kind(config.databaseUrl),
      runtime: Runtime.detect(),
    });

    /** `serve` never resolves: the process lives until a signal closes it. */
    await new Promise(() => {});
    return 0;
  }

  async function migrate(config: Config): Promise<number> {
    const { store, log } = await App.wire(config);
    log.info('schema ready', { version: await store.version, latest: Store.latest });
    await store.close();
    return 0;
  }

  async function seed(config: Config): Promise<number> {
    const { store, log } = await App.wire(config);
    await Seed.run(store, log.child('seed'));
    await store.close();
    return 0;
  }

  /**
   * One pass of the queue, for a deployment that would rather run this from cron than keep a
   * scheduler in the process. It sends through the same channels and then exits.
   */
  async function work(config: Config): Promise<number> {
    const { store, log } = await App.wire(config, { assets: false });
    const notify = App.channels(config, store, log, App.bot(config, store, log));
    const scheduler = new Scheduler({ store, notify, log, baseUrl: config.baseUrl });

    /** The recurring rows are queued here too: a deployment that only ever runs this still sweeps. */
    await scheduler.plan();

    /** One tick is one batch, so the queue is drained until it is empty rather than shortened. */
    let ran = 0;
    for (let pass = 0; pass < PASSES; pass++) {
      const done = await scheduler.tick();
      ran += done;
      if (done === 0) break;
    }

    log.info('queue drained', { jobs: ran });
    await store.close();
    return 0;
  }

  /**
   * A backup, taken while the server is running. SQLite's `vacuum into` writes a consistent copy
   * of a live database, which a file copy does not: copying a `.db` under a writer is how a club
   * ends up with a backup that will not open.
   */
  async function backup(config: Config, args: readonly string[]): Promise<number> {
    const path = args[0];
    if (!path) {
      throw Diag.error(Codes.cli.backup, 'backup needs a path to write to').help(
        markup`\`${NAME} backup clubbie-$(date +%F).db\``,
      );
    }

    if (Store.kind(config.databaseUrl) !== 'sqlite') {
      throw Diag.error(Codes.cli.backup, 'only a sqlite database is backed up from here')
        .note(markup`this deployment is on ${Store.kind(config.databaseUrl)}`)
        .help('use `pg_dump` for postgres, which knows how to do it better than this would');
    }

    const { store, log } = await App.wire(config, { assets: false });
    await sql`vacuum into ${sql.lit(path)}`.execute(store.db);
    log.info('backup written', { path });
    await store.close();
    return 0;
  }

  async function admin(config: Config, args: readonly string[]): Promise<number> {
    const email = args[0];
    if (!email) {
      throw Diag.error(Codes.cli.admin, 'admin needs the email of an existing member').help(
        markup`\`${NAME} admin someone@example.org\``,
      );
    }

    const { store, log } = await App.wire(config);
    const member = await store.members.byEmail(email);
    if (!member) {
      await store.close();
      throw Diag.error(Codes.cli.admin, markup`no member has the email \`${email}\``)
        .note('a member exists once they have signed in at least once')
        .help('ask them to sign in, then run this again');
    }

    await store.members.update(member.id, { role: Members.FOUNDER, status: Member.ACTIVE });
    log.info('promoted', { member: member.id, email: member.email });
    await store.close();
    return 0;
  }
}
