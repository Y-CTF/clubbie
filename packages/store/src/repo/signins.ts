import { Bytes, Id, Signin, type SigninId } from '@clubbie/core';
import type { Kysely } from 'kysely';
import { Row } from '../row.ts';
import type { Schema } from '../schema.ts';

/** A request to sign in, as the two secrets that spend it. */
export interface Requested {
  readonly id: SigninId;
  readonly email: string;
  readonly token: string;
  readonly code: string;
  readonly expiresAt: Date;
}

/** Why a request would not be spent, so a page can say which. */
export const REJECTIONS = ['unknown', 'expired', 'exhausted'] as const;
export type Rejection = (typeof REJECTIONS)[number];

/**
 * Requests to sign in with an address alone. Neither secret is stored, only its digest, so a
 * leaked database lists who asked to sign in rather than how to become them.
 */
export class Signins {
  constructor(private readonly db: Kysely<Schema>) {}

  /** Asking again retires the last request: two live codes means the one read may be the dead one. */
  async open(email: string, now: Date = new Date()): Promise<Requested> {
    const id = Id.create<'signin'>(now.getTime());
    const token = Signin.token();
    const code = Signin.code();
    const expiresAt = new Date(now.getTime() + Signin.TTL);

    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('signin')
        .set({ usedAt: Row.ms(now) })
        .where('email', '=', email)
        .where('usedAt', 'is', null)
        .execute();

      await tx
        .insertInto('signin')
        .values({
          id,
          email,
          token: await Bytes.digest(token),
          code: await Bytes.digest(code),
          tries: 0,
          expiresAt: Row.ms(expiresAt),
          usedAt: null,
        })
        .execute();
    });

    return { id, email, token, code, expiresAt };
  }

  /**
   * The address a link proves. `usedAt` is written by the statement that reads it, so a mail
   * scanner opening the link a millisecond before the member cannot spend it out from under them.
   */
  async claim(token: string, now: Date = new Date()): Promise<string | null> {
    const spent = await this.db
      .updateTable('signin')
      .set({ usedAt: Row.ms(now) })
      .where('token', '=', await Bytes.digest(token))
      .where('usedAt', 'is', null)
      .where('expiresAt', '>', Row.ms(now))
      .returningAll()
      .executeTakeFirst();
    return spent?.email ?? null;
  }

  /** A wrong code costs a try, and the request is spent once the budget is gone. */
  async answer(email: string, code: string, now: Date = new Date()): Promise<string | Rejection> {
    const digest = await Bytes.digest(code);

    return this.db.transaction().execute(async (tx) => {
      const open = await tx
        .selectFrom('signin')
        .selectAll()
        .where('email', '=', email)
        .where('usedAt', 'is', null)
        .orderBy('expiresAt', 'desc')
        .executeTakeFirst();

      if (!open) return 'unknown';
      if (open.expiresAt <= Row.ms(now)) return 'expired';

      if (open.code !== digest) {
        const tries = open.tries + 1;
        const spent = tries >= Signin.TRIES;
        await tx
          .updateTable('signin')
          .set({ tries, ...(spent && { usedAt: Row.ms(now) }) })
          .where('id', '=', open.id)
          .execute();
        return spent ? 'exhausted' : 'unknown';
      }

      await tx
        .updateTable('signin')
        .set({ usedAt: Row.ms(now) })
        .where('id', '=', open.id)
        .execute();
      return open.email;
    });
  }

  /** Spent and expired requests, dropped by the nightly sweep. */
  async sweep(now: Date = new Date()): Promise<number> {
    const result = await this.db
      .deleteFrom('signin')
      .where((eb) => eb.or([eb('expiresAt', '<=', Row.ms(now)), eb('usedAt', 'is not', null)]))
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}
