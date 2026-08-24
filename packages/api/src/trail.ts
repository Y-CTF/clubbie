import type { Act } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Context } from 'hono';
import type { Env } from './context.ts';

/**
 * Records an admin act, from a handler that has a context. One call site per act, and the caller
 * writes the act name from `ACTS` rather than a sentence, so a trail is queryable.
 *
 * Recording never fails a request. The change has already happened by the time this runs, and
 * refusing it afterwards because the trail was unwritable would be a worse answer than a gap.
 */
export namespace Trail {
  export async function record(
    c: Context<Env>,
    act: Act,
    subject: string | null,
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await c.get('store').audit.record(act, c.get('member')?.id ?? null, subject, detail);
    } catch (error) {
      c.get('log').warn('audit not recorded', { act, subject, reason: Diag.of(error).message });
    }
  }
}
