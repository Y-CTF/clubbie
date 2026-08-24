import type { Job } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { Check } from '../check.ts';
import { Codes } from '../codes.ts';
import type { Env } from '../context.ts';
import { Fail } from '../fail.ts';
import { Guard } from '../guard.ts';
import { Input } from '../input.ts';
import { Trail } from '../trail.ts';
import { Wire } from '../wire.ts';

/**
 * The work the app owes itself: what is waiting, what is running, what has been done, and what
 * could not be done at all.
 *
 * It has a screen because the alternative is a log line. A club with no sysadmin does not read
 * logs, so an announcement that never went out was, until this route existed, invisible to
 * everybody except the person who did not receive it. It shows the whole queue rather than only
 * the failures for the same reason: "nothing has failed" and "nothing has run since Tuesday" look
 * identical on a screen that only draws failures, and one of the two is a broken deployment.
 *
 * Acting on a job is deliberately a person's decision rather than a fourth automatic attempt: the
 * reason a job failed three times is usually a setting, and a queue that retried forever would
 * send a three-week-old reminder the moment somebody fixed it.
 */
export const jobs = new Hono<Env>()
  .get('/', Guard.needs('club:manage'), vValidator('query', Input.jobQuery, Check.query), async (c) => {
    const store = c.get('store');
    const { limit, offset, state, kind } = c.req.valid('query');
    const query = { limit, offset, state, kind };

    /**
     * The total travels with the page so a pager knows whether there is a next one, and the tally
     * travels with it so the filter can say how much is behind each of its states without the
     * screen asking four more times.
     */
    const [listed, total, tally] = await Promise.all([
      store.jobs.list(query),
      store.jobs.count(query),
      store.jobs.tally(),
    ]);
    return c.json({ jobs: listed.map(Wire.job), total, tally });
  })

  .post(
    '/:id/retry',
    Guard.needs('club:manage'),
    vValidator('param', Input.params.job, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');

      const job = await store.jobs.byId(id);
      if (!job) throw Fail.missing('job');

      /**
       * A job a drainer is holding is not put back, and says why. Queueing a second copy of a
       * message somebody is about to receive is the one outcome worth refusing.
       */
      if (!(await store.jobs.requeue(id))) throw stuck(await store.jobs.byId(id), 'put back');

      c.get('log').info('job requeued', { job: id, kind: job.kind });
      await Trail.record(c, 'job.retry', id, { kind: job.kind, attempts: job.attempts });
      return c.json({ ok: true });
    },
  )

  .delete(
    '/:id',
    Guard.needs('club:manage'),
    vValidator('param', Input.params.job, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');

      const job = await store.jobs.byId(id);
      if (!job) throw Fail.missing('job');
      if (!(await store.jobs.drop(id))) throw stuck(await store.jobs.byId(id), 'thrown away');

      c.get('log').warn('job discarded', { job: id, kind: job.kind });
      await Trail.record(c, 'job.discard', id, { kind: job.kind, error: job.error });
      return c.json({ ok: true });
    },
  );

/**
 * The refusal both writes share: a job that would not move, and where it actually is now. It reads
 * the row back rather than reporting the state the page was rendered from, because the interesting
 * case is precisely that something else moved it in between.
 */
function stuck(now: Job | null, act: string): Error {
  return Fail.conflict(
    Diag.error(Codes.job.state, markup`that job is \`${now?.state ?? 'gone'}\` and cannot be ${act}`)
      .note('something else has moved it since this page was loaded')
      .help('reload the page to see where it is now'),
  );
}
