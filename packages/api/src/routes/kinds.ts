import { Kind, type KindId } from '@clubbie/core';
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

/**
 * The club's own words for what an event is.
 *
 * They are rows because they are the club's vocabulary and not the app's: a choir, a hiking group
 * and a CTF team share every other concept in this codebase and share none of these words. A fixed
 * list would mean every club that is not the one this was written for files its evenings under
 * "other", and would be exactly the kind of club-specific hardcoding this app is supposed to have
 * none of.
 *
 * Reading them is `event:read`, because every listing and every form needs them. Changing them is
 * `club:manage`, like the rest of the settings.
 */
export const kinds = new Hono<Env>()
  .get('/', Guard.needs('event:read'), async (c) => {
    const listing = await c.get('store').kinds.list();
    return c.json(listing.map((kind) => ({ id: kind.id, label: kind.label, position: kind.position })));
  })

  .post('/', Guard.needs('club:manage'), vValidator('json', Input.kinds, Check.body), async (c) => {
    const store = c.get('store');
    const { label, id } = c.req.valid('json');

    /** The slug is the club's if it gave one, and made from the label if it did not. */
    const wanted = id ?? (Kind.slug(label) as KindId);
    if (!Kind.is(wanted)) {
      throw Fail.invalid(
        Diag.error(Codes.kind.slug, markup`there is no url-safe name in *${label}*`)
          .note('a kind is stored under a short name made of letters, digits and hyphens')
          .help('give the name explicitly alongside the label'),
      );
    }

    if (await store.kinds.byId(wanted)) {
      throw Fail.conflict(
        Diag.error(Codes.kind.taken, markup`this club already has a kind called \`${wanted}\``).help(
          'rename the one it has, or pick another name',
        ),
      );
    }

    if ((await store.kinds.count()) >= Kind.LIMIT) {
      throw Fail.invalid(
        Diag.error(Codes.kind.many, markup`a club keeps at most ${Kind.LIMIT} kinds`)
          .note('past that it is not a vocabulary, it is a tagging system')
          .help('delete one that nothing uses'),
      );
    }

    const made = await store.kinds.add({ id: wanted, label });
    await Trail.record(c, 'kind.create', made.id, { label });
    return c.json({ id: made.id, label: made.label, position: made.position }, 201);
  })

  .patch(
    '/:id',
    Guard.needs('club:manage'),
    vValidator('param', Input.params.kind, Check.param),
    vValidator('json', Input.kindPatch, Check.body),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');

      const changed = await store.kinds.update(id, c.req.valid('json'));
      if (!changed) throw Fail.missing('kind');

      /** Renaming touches no event: an event stores the id, and only the label moved. */
      await Trail.record(c, 'kind.update', id, { label: changed.label });
      return c.json({ id: changed.id, label: changed.label, position: changed.position });
    },
  )

  .delete(
    '/:id',
    Guard.needs('club:manage'),
    vValidator('param', Input.params.kind, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');

      const kind = await store.kinds.byId(id);
      if (!kind) throw Fail.missing('kind');

      /**
       * A kind that events point at is not deleted. The alternative is an event whose kind is a
       * word nothing can look up, and a club that discovers that three terms later has no way of
       * knowing what those evenings were.
       */
      const used = await store.kinds.usage(id);
      if (used > 0) {
        throw Fail.conflict(
          Diag.error(Codes.kind.used, markup`*${kind.label}* is what ${used} things are`)
            .note('an event keeps the kind it was given, so this one cannot be taken away')
            .help('rename it instead, or move those events to another kind first'),
        );
      }

      if ((await store.kinds.count()) <= 1) {
        throw Fail.conflict(
          Diag.error(Codes.kind.last, 'a club keeps at least one kind').help(
            'add the one you want before deleting the one you do not',
          ),
        );
      }

      await store.kinds.remove(id);
      await Trail.record(c, 'kind.delete', id, { label: kind.label });
      return c.json({ ok: true });
    },
  );

/**
 * Whether a kind is one this club has, refused with a diagnostic when it is not.
 *
 * Every write that carries a kind goes through here: an event, an edit, a schedule, a schedule's
 * template. The check cannot live in `Input`, because the answer is a query and a schema is not.
 */
export namespace Kinds {
  export async function must(store: Env['Variables']['store'], kind: KindId | undefined): Promise<void> {
    if (kind === undefined) return;
    if (await store.kinds.has(kind)) return;

    const known = await store.kinds.list();
    throw Fail.invalid(
      Diag.error(Codes.kind.unknown, markup`this club has no kind called \`${kind}\``)
        .note(markup`it has ${known.map((one) => one.id).join(', ')}`)
        .help('add it on the settings page, or pick one the club already has'),
    );
  }
}
