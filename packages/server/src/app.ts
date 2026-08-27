import { Api } from '@clubbie/api';
import { Auth } from '@clubbie/auth';
import { Bot, Codes as BotCodes } from '@clubbie/bot';
import { Brand, Site } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { Logger, Sink } from '@clubbie/log';
import { Email, Notify, type Sender, Telegram } from '@clubbie/notify';
import { Store } from '@clubbie/store';
import { Hono } from 'hono';
import { Assets } from './assets.ts';
import type { Config } from './config.ts';
import { Scheduler } from './scheduler.ts';

export interface Wired {
  readonly app: Hono;
  readonly store: Store;
  readonly auth: Auth;
  readonly log: Logger;
}

export interface Options {
  /** Serve the built SPA in front of the API. False on Workers, where the platform does it. */
  readonly assets?: boolean;
  readonly log?: Logger;
}

/**
 * Everything a running clubbie is, assembled in one place: a store, the sign-in providers, the
 * API, and (where there is a filesystem) the built SPA in front of it.
 *
 * `serve`, the migration command, the Workers entry point and the tests all build it here, so
 * there is no second wiring that can drift from this one.
 */
export namespace App {
  export const ALL = '*';

  export function logger(config: Config): Logger {
    const sink = config.json ? new Sink.Json() : new Sink.Console();
    return Logger.create(Brand.scope, sink, config.level);
  }

  export async function wire(config: Config, options: Options = {}): Promise<Wired> {
    const log = options.log ?? logger(config);
    const store = await Store.open(config.databaseUrl, log);
    const auth = Auth.create(store, { baseUrl: config.baseUrl, providers: config.providers });

    if (auth.empty) {
      log.warn('no sign-in provider is configured', {
        help: 'set the client id and secret of a provider, then restart',
      });
    }

    const api = Api.create({
      store,
      auth,
      log,
      secret: config.secret,
      baseUrl: config.baseUrl,
      trustProxy: config.trustProxy,
    });
    const app = new Hono().route(Site.API, api);
    if (options.assets !== false) {
      app.use(ALL, Assets.middleware(config.assets, log.child('assets')));
    }

    return { app, store, auth, log };
  }

  /**
   * The bot, when a token is set. It is optional on purpose: a club that does not use Telegram
   * should not have to hold a token, and its absence is a `debug` line rather than a warning.
   */
  export async function telegram(config: Config, store: Store, log: Logger): Promise<Bot | null> {
    const bot = App.bot(config, store, log);
    if (!bot) return null;

    /**
     * Telegram being unreachable is not this deployment being down.
     *
     * The first thing a bot does is ask Telegram who it is, and that one request failing used to
     * take the process with it: a dev machine between wifi networks, or an outage at somebody
     * else's company, and the club's own site stopped serving its own members. Everything that
     * does not need Telegram carries on, the bot object is kept so a notice can still try, and the
     * job queue retries what it could not send.
     */
    try {
      await bot.start();
    } catch (error) {
      log.error(
        'the telegram bot could not start',
        Diag.of(error, BotCodes.start)
          .note('the api, the web app and the scheduler are running')
          .help('check the token and the network, then restart to pick the bot back up'),
      );
    }
    return bot;
  }

  /**
   * The bot, built but not listening. `clubbie work` sends through it without ever polling for
   * updates: a one-shot pass has no business answering commands.
   */
  export function bot(config: Config, store: Store, log: Logger): Bot | null {
    if (!config.telegram) {
      log.debug('no telegram token, bot not started');
      return null;
    }
    return new Bot({ token: config.telegram, store, log, baseUrl: config.baseUrl });
  }

  /**
   * The channels a deployment actually has. A club with neither configured is not broken: nothing
   * is sent, every job still runs, and the app is a web app that says so once at boot.
   */
  export function channels(config: Config, store: Store, log: Logger, bot: Bot | null): Notify {
    const senders: Sender[] = [];
    if (bot) senders.push(new Telegram(bot.tell));
    if (config.email) {
      const { transport, ...mailbox } = config.email;
      senders.push(Email.over(transport, mailbox));
      log.debug('email configured', { transport });
    }

    const notify = new Notify(store, senders, log);
    if (notify.silent)
      log.warn('no notification channel is configured', { help: 'set TELEGRAM_TOKEN or EMAIL_API_KEY' });
    return notify;
  }

  /** The queue drainer, started beside the server so one process is still the whole deployment. */
  export async function scheduler(config: Config, store: Store, notify: Notify, log: Logger) {
    const scheduler = new Scheduler({ store, notify, log, baseUrl: config.baseUrl });
    await scheduler.start();
    return scheduler;
  }
}
