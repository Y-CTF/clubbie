import type { Act, Member, MemberId } from '@clubbie/core';
import { Member as Membership } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { MemberPatch as Patch } from '@clubbie/store';
import { vValidator } from '@hono/valibot-validator';
import { type Context, Hono } from 'hono';
import { Check } from '../check.ts';
import { Codes } from '../codes.ts';
import type { Env } from '../context.ts';
import { Csv } from '../csv.ts';
import { Fail } from '../fail.ts';
import { Guard } from '../guard.ts';
import { Input } from '../input.ts';
import { Trail } from '../trail.ts';
import { Wire } from '../wire.ts';

/**
 * The roster. Admitting a member is a status change and nothing else, so there is one way in
 * (`pending` becomes `active`) and one way out (`active` becomes `alumni`), and no separate
 * approve endpoint that could drift from it.
 */
export const members = new Hono<Env>()
  .get('/', Guard.needs('member:read'), vValidator('query', Input.memberQuery, Check.query), async (c) => {
    const { status, role, q } = c.req.valid('query');
    const emails = c.get('ability').can('member:manage');
    const roster = await c.get('store').members.list({
      ...(status && { status }),
      ...(role && { role }),
      ...(q && { query: q }),
      /** Addresses are searchable only by whoever the answer would show them to. */
      emails,
    });
    return c.json(roster.map((member) => Wire.listed(member, emails)));
  })

  /** The roster as a file: the one export a committee asks for by name. */
  .get('/roster.csv', Guard.needs('member:manage'), async (c) => {
    const roster = await c.get('store').members.list();
    const rows = roster.map((member) => [
      member.name,
      member.email,
      member.role,
      member.status,
      member.createdAt,
    ]);

    const csv = Csv.of(['name', 'email', 'role', 'status', 'joined'], rows);
    return c.body(csv, 200, Csv.headers(Csv.filename('roster')));
  })

  .get(
    '/:id',
    Guard.needs('member:read'),
    vValidator('param', Input.params.member, Check.param),
    async (c) => {
      const member = await Guard.find('member', c.get('store').members.byId(c.req.valid('param').id));
      return c.json(Wire.peer(member));
    },
  )

  /** One member's own attendance history, which is the question an organiser asks about them. */
  .get(
    '/:id/rsvps',
    Guard.needs('member:manage'),
    vValidator('param', Input.params.member, Check.param),
    async (c) => {
      const history = await c.get('store').rsvps.timeline(c.req.valid('param').id);
      return c.json(history.map(Wire.moment));
    },
  )

  /**
   * The same edit to a page of members at once: admitting a term's intake, or retiring last
   * year's. It exists because the alternative is fifty requests and fifty confirmations, and
   * because a committee doing that by hand skips the last few.
   *
   * Every member is recorded in the trail separately. One entry saying "changed 40 members" is
   * not an answer to "when did she stop being active", which is the question the trail is for.
   */
  .patch('/', Guard.needs('member:manage'), vValidator('json', Input.memberships, Check.body), async (c) => {
    const store = c.get('store');
    const { ids, ...patch } = c.req.valid('json');
    if (patch.role === undefined && patch.status === undefined) {
      throw Fail.invalid(
        Diag.error(Codes.member.nothing, 'that would change nothing').help('send a role, a status, or both'),
      );
    }

    /** An admin editing themselves in a batch is the same lockout as doing it one at a time. */
    const me = Guard.member(c);
    if (ids.some((id) => me.is(id))) throw Fail.forbidden('an admin cannot change their own membership');

    const changed: string[] = [];
    for (const id of ids) {
      const before = await store.members.byId(id);
      if (!before) continue;

      const updated = await store.members.update(id, patch);
      if (!updated) continue;

      await Members.settle(c, id, before, updated, patch);
      changed.push(id);
    }

    c.get('log').info('members changed', { count: changed.length, ...patch });
    return c.json({ changed: changed.length });
  })

  .patch(
    '/:id',
    Guard.needs('member:manage'),
    vValidator('param', Input.params.member, Check.param),
    vValidator('json', Input.membership, Check.body),
    async (c) => {
      const { id } = c.req.valid('param');
      const patch = c.req.valid('json');
      const store = c.get('store');

      const before = await Guard.find('member', store.members.byId(id));

      /**
       * An admin may not take their own admin away, or retire themselves, for the same reason
       * they may not delete themselves: a club with one admin has a way to end up with none, and
       * nothing in the app can grant the role back. `DELETE` already refused this; the edit that
       * reaches the same state did not.
       */
      if (Guard.member(c).is(id)) {
        if (patch.role !== undefined && patch.role !== before.role) {
          throw Fail.forbidden('an admin cannot change their own role');
        }
        if (patch.status !== undefined && patch.status !== before.status) {
          throw Fail.forbidden('an admin cannot change their own status');
        }
      }
      const updated = await Guard.find('member', store.members.update(id, patch));

      c.get('log').info('member changed', { member: id, role: updated.role, status: updated.status });
      await Members.settle(c, id, before, updated, patch);
      return c.json(Wire.peer(updated));
    },
  )

  .delete(
    '/:id',
    Guard.needs('member:manage'),
    vValidator('param', Input.params.member, Check.param),
    async (c) => {
      const { id } = c.req.valid('param');
      if (Guard.member(c).is(id)) throw Fail.forbidden('an admin cannot remove themselves');

      /** A member who was never there is not removed: it is a 404, and it is not a trail entry. */
      await Guard.find('member', c.get('store').members.byId(id));

      await c.get('store').members.remove(id);
      c.get('log').warn('member removed', { member: id });
      await Trail.record(c, 'member.remove', id);
      return c.json({ ok: true });
    },
  );

/**
 * What an edit to a membership was, in the trail's own words.
 *
 * It is decided from the rows rather than from the patch. `patch.role ? 'member.role' :
 * 'member.admit'` was the version this replaced, and it wrote *admitted* into the trail for the
 * edit that retires somebody: the one report a committee reads months later said the opposite of
 * what happened, which is worse than saying nothing.
 */
export namespace Members {
  export function act(before: Member, after: Member): Act {
    if (before.role !== after.role) return 'member.role';
    return after.status === Membership.ACTIVE ? 'member.admit' : 'member.retire';
  }

  /**
   * What a membership edit owes beyond the row: the sessions it invalidates, the notice it queues,
   * and the entry it writes into the trail.
   *
   * Written once because two routes make the same edit, one member at a time and forty at a time,
   * and the two copies had already drifted: one wrote the status as a bare literal where the other
   * used `Member.ACTIVE`.
   */
  export async function settle(
    c: Context<Env>,
    id: MemberId,
    before: Member,
    after: Member,
    patch: Patch,
  ): Promise<void> {
    const store = c.get('store');
    /** A member who is no longer active keeps no live session; the next sign-in re-decides. */
    if (patch.status && patch.status !== Membership.ACTIVE) await store.sessions.closeAll(id);
    /** Being admitted is worth hearing about, and is the one notice nobody can switch off. */
    if (patch.status === Membership.ACTIVE && before.status !== Membership.ACTIVE) {
      await store.jobs.schedule('member.admitted', { memberId: id });
    }

    await Trail.record(c, Members.act(before, after), id, {
      from: { role: before.role, status: before.status },
      to: { role: after.role, status: after.status },
    });
  }
}
