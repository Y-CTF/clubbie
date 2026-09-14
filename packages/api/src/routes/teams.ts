import { type Event, Team, type TeamId } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { vValidator } from '@hono/valibot-validator';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { Check } from '../check.ts';
import { Codes } from '../codes.ts';
import type { Env } from '../context.ts';
import { Fail, Refusal } from '../fail.ts';
import { Guard } from '../guard.ts';
import { Input } from '../input.ts';
import { Trail } from '../trail.ts';
import { Wire } from '../wire.ts';
import { Events } from './events.ts';

/**
 * Teams on one event, and on no other.
 *
 * Every write here asks the same two questions of the event before it asks anything of the
 * caller: does it use teams, and does it still take them. Both belong to the event rather than to
 * a handler, which is what `Teams.changeable` is.
 */
export const teams = new Hono<Env>()
  .get(
    '/:id/teams',
    Guard.needs('event:read'),
    vValidator('param', Input.params.event, Check.param),
    async (c) => {
      const event = await Events.seen(c, c.req.valid('param').id);
      const store = c.get('store');

      return c.json({
        teams: (await store.teams.list(event.id)).map(Wire.team),
        mine: await store.teams.mine(event.id, Guard.member(c).id),
      });
    },
  )

  .post(
    '/:id/teams',
    Guard.needs('event:rsvp'),
    vValidator('param', Input.params.event, Check.param),
    vValidator('json', Input.team, Check.body),
    async (c) => {
      const event = await Events.seen(c, c.req.valid('param').id);
      Teams.changeable(event);

      const organiser = c.get('ability').canOwn('event:manage', event.createdBy);
      if (!Team.creatable(event.teamsBy, organiser)) {
        throw Fail.forbidden('only an organiser starts a team at this event');
      }

      const member = Guard.member(c);
      const team = await Teams.wrote(() =>
        c.get('store').teams.create(event, c.req.valid('json'), member.id),
      );

      await Trail.record(c, 'event.update', event.id, { team: team.id, name: team.name });
      return c.json(Wire.team({ team, members: [{ id: member.id, name: member.name }] }), 201);
    },
  )

  .post(
    '/:id/teams/:teamId/join',
    Guard.needs('event:rsvp'),
    vValidator('param', Input.params.eventTeam, Check.param),
    async (c) => {
      const { id, teamId } = c.req.valid('param');
      const event = await Events.seen(c, id);
      Teams.changeable(event);

      const roster = await Teams.wrote(() => c.get('store').teams.join(event, teamId, Guard.member(c).id));
      return c.json(Wire.team(roster));
    },
  )

  /** Leaving is keyed on the caller rather than on a team: they are only ever on one. */
  .delete(
    '/:id/teams/mine',
    Guard.needs('event:rsvp'),
    vValidator('param', Input.params.event, Check.param),
    async (c) => {
      const event = await Events.seen(c, c.req.valid('param').id);
      Teams.changeable(event);

      const left = await c.get('store').teams.leave(event.id, Guard.member(c).id);
      return c.json({ left: left !== null });
    },
  )

  .patch(
    '/:id/teams/:teamId',
    Guard.needs('event:rsvp'),
    vValidator('param', Input.params.eventTeam, Check.param),
    vValidator('json', Input.team, Check.body),
    async (c) => {
      const { id, teamId } = c.req.valid('param');
      const event = await Events.seen(c, id);
      Teams.changeable(event);
      const team = await Teams.captained(c, event, teamId);

      const renamed = await c.get('store').teams.rename(team.id, c.req.valid('json').name);
      if (!renamed) throw Fail.missing('team');

      await Trail.record(c, 'event.update', event.id, { team: team.id, name: renamed.name });
      return c.json(Wire.team({ team: renamed, members: [] }));
    },
  )

  .delete(
    '/:id/teams/:teamId',
    Guard.needs('event:rsvp'),
    vValidator('param', Input.params.eventTeam, Check.param),
    async (c) => {
      const { id, teamId } = c.req.valid('param');
      const event = await Events.seen(c, id);
      Teams.changeable(event);
      const team = await Teams.captained(c, event, teamId);

      await c.get('store').teams.remove(team.id);
      await Trail.record(c, 'event.update', event.id, { team: team.id, removed: true });
      return c.json({ ok: true });
    },
  );

export namespace Teams {
  /** Whether this event takes team changes at all, which is the gate on every write in this file. */
  export function changeable(event: Event, now: Date = new Date()): void {
    if (!event.teams) {
      throw Fail.because(
        Refusal.Closed,
        Diag.error(Codes.team.off, 'this event is not entered in teams')
          .note('an organiser turns teams on from the event itself')
          .help('answer it on your own instead'),
      );
    }

    if (Team.settled(event, now)) {
      throw Fail.because(
        Refusal.Closed,
        Diag.error(Codes.team.settled, 'the teams for this event are fixed now')
          .note('they stop changing when answers close, so a sheet an organiser printed still holds')
          .help('ask an organiser if something has to change'),
      );
    }
  }

  /** The team, if this caller is its captain or may manage the event it is on. */
  export async function captained(c: Context<Env>, event: Event, id: TeamId): Promise<Team> {
    const team = await Guard.find('team', c.get('store').teams.byId(id));
    if (team.eventId !== event.id) throw Fail.missing('team');

    const organiser = c.get('ability').canOwn('event:manage', event.createdBy);
    if (!team.captained(Guard.member(c).id, organiser)) {
      throw Fail.forbidden('only the captain or an organiser may change this team');
    }
    return team;
  }

  /**
   * A store refusal as an HTTP one. The repository throws diagnostics, because it sits below the
   * API and knows nothing about statuses, and every one it raises here is a conflict: a team that
   * filled up, a member already on one, an event at its limit.
   */
  export async function wrote<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Diag) throw Fail.conflict(error);
      throw error;
    }
  }
}
