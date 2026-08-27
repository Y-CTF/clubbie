import { Http } from './http.ts';
import { Smtp } from './smtp.ts';
import type { Mailbox, Wire } from './transport.ts';

/**
 * Every way a deployment can send mail, with what each of them needs to work.
 *
 * It is the same table `Providers` is for sign-in, and for the same reason: the config validates
 * through it, the wiring builds from it, and adding a provider is one entry rather than an edit
 * in four files. `needs` is what makes the validation generic, so a club that picked Mailjet and
 * gave one half of its key pair is told which half at boot rather than at the first reminder.
 */
export interface Kind {
  /** The credentials this transport cannot work without, named as the environment names them. */
  readonly needs: readonly (keyof Mailbox)[];
  make(credentials: Mailbox): Wire;
}

const KINDS = {
  resend: { needs: ['key'], make: (credentials) => new Http.Resend(credentials) },
  postmark: { needs: ['key'], make: (credentials) => new Http.Postmark(credentials) },
  sendgrid: { needs: ['key'], make: (credentials) => new Http.SendGrid(credentials) },
  mailgun: { needs: ['key', 'domain'], make: (credentials) => new Http.Mailgun(credentials) },
  brevo: { needs: ['key'], make: (credentials) => new Http.Brevo(credentials) },
  mailjet: { needs: ['key', 'secret'], make: (credentials) => new Http.Mailjet(credentials) },
  smtp: { needs: ['url'], make: (credentials) => new Smtp(credentials) },
} as const satisfies Record<string, Kind>;

export type Named = keyof typeof KINDS;

export namespace Transports {
  export const NAMES = Object.keys(KINDS) as Named[];
  /** What a club that set a key and named nothing gets, because it is what most of them use. */
  export const DEFAULT: Named = 'resend';

  export function kind(name: Named): Kind {
    return KINDS[name];
  }

  export function known(name: string): name is Named {
    return name in KINDS;
  }

  export function make(name: Named, credentials: Mailbox): Wire {
    return KINDS[name].make(credentials);
  }

  /** What this transport is missing, so a refusal can name it rather than say "misconfigured". */
  export function missing(name: Named, credentials: Partial<Mailbox>): readonly (keyof Mailbox)[] {
    return KINDS[name].needs.filter((need) => !credentials[need]);
  }
}
