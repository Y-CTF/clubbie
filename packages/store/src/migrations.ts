import { Club, Design, Kind, type KindId } from '@clubbie/core';
import type { Kysely } from 'kysely';
import { Row } from './row.ts';
import type { Schema } from './schema.ts';

export interface Migration {
  readonly version: number;
  readonly name: string;
  up(db: Kysely<Schema>): Promise<void>;
}

/**
 * The schema, in order, expressed through Kysely's builder so one definition emits both dialects.
 * Migrations are append-only: a shipped one is never edited, because a deployment that already
 * applied it will never run it again.
 *
 * Column types stay to the four both dialects agree on (`text`, `bigint`, `integer`, `varchar`).
 * Instants are epoch milliseconds and flags are 0 or 1, as `schema.ts` explains.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'members and sessions',
    async up(db) {
      await db.schema
        .createTable('member')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('name', 'text', (c) => c.notNull())
        .addColumn('email', 'text', (c) => c.notNull().unique())
        .addColumn('avatar', 'text')
        .addColumn('role', 'text', (c) => c.notNull())
        .addColumn('status', 'text', (c) => c.notNull())
        .addColumn('hidden', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('createdAt', 'bigint', (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('account')
        .addColumn('provider', 'text', (c) => c.notNull())
        .addColumn('subject', 'text', (c) => c.notNull())
        .addColumn('memberId', 'text', (c) => c.notNull().references('member.id').onDelete('cascade'))
        .addColumn('linkedAt', 'bigint', (c) => c.notNull())
        .addPrimaryKeyConstraint('account_pk', ['provider', 'subject'])
        .execute();
      await db.schema.createIndex('account_member').on('account').column('memberId').execute();

      await db.schema
        .createTable('session')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('memberId', 'text', (c) => c.notNull().references('member.id').onDelete('cascade'))
        .addColumn('expiresAt', 'bigint', (c) => c.notNull())
        .addColumn('createdAt', 'bigint', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('session_expiry').on('session').column('expiresAt').execute();
    },
  },
  {
    version: 2,
    name: 'seasons and memberships',
    async up(db) {
      await db.schema
        .createTable('season')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('name', 'text', (c) => c.notNull())
        .addColumn('startsAt', 'bigint', (c) => c.notNull())
        .addColumn('endsAt', 'bigint', (c) => c.notNull())
        .addColumn('current', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('renewalAt', 'bigint')
        .addColumn('createdAt', 'bigint', (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('membership')
        .addColumn('memberId', 'text', (c) => c.notNull().references('member.id').onDelete('cascade'))
        .addColumn('seasonId', 'text', (c) => c.notNull().references('season.id').onDelete('cascade'))
        .addColumn('joinedAt', 'bigint', (c) => c.notNull())
        .addPrimaryKeyConstraint('membership_pk', ['memberId', 'seasonId'])
        .execute();
      await db.schema.createIndex('membership_season').on('membership').column('seasonId').execute();
    },
  },
  {
    version: 3,
    name: 'events and rsvps',
    async up(db) {
      await db.schema
        .createTable('event')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('title', 'text', (c) => c.notNull())
        .addColumn('description', 'text')
        .addColumn('kind', 'text', (c) => c.notNull())
        .addColumn('state', 'text', (c) => c.notNull())
        .addColumn('startsAt', 'bigint', (c) => c.notNull())
        .addColumn('endsAt', 'bigint')
        .addColumn('closesAt', 'bigint')
        .addColumn('location', 'text')
        .addColumn('capacity', 'integer')
        .addColumn('seasonId', 'text', (c) => c.references('season.id').onDelete('set null'))
        .addColumn('createdBy', 'text', (c) => c.notNull().references('member.id'))
        .addColumn('createdAt', 'bigint', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('event_start').on('event').column('startsAt').execute();
      await db.schema.createIndex('event_season').on('event').column('seasonId').execute();

      await db.schema
        .createTable('rsvp')
        .addColumn('eventId', 'text', (c) => c.notNull().references('event.id').onDelete('cascade'))
        .addColumn('memberId', 'text', (c) => c.notNull().references('member.id').onDelete('cascade'))
        .addColumn('answer', 'text', (c) => c.notNull())
        .addColumn('attendedAt', 'bigint')
        .addColumn('answeredAt', 'bigint', (c) => c.notNull())
        .addPrimaryKeyConstraint('rsvp_pk', ['eventId', 'memberId'])
        .execute();
      await db.schema.createIndex('rsvp_member').on('rsvp').column('memberId').execute();
    },
  },
  {
    version: 4,
    name: 'telegram linking',
    async up(db) {
      await db.schema
        .createTable('link')
        .addColumn('token', 'text', (c) => c.primaryKey())
        .addColumn('memberId', 'text', (c) => c.notNull().references('member.id').onDelete('cascade'))
        .addColumn('expiresAt', 'bigint', (c) => c.notNull())
        .addColumn('usedAt', 'bigint')
        .execute();

      await db.schema
        .createTable('telegram')
        .addColumn('memberId', 'text', (c) => c.primaryKey().references('member.id').onDelete('cascade'))
        .addColumn('chatId', 'text', (c) => c.notNull().unique())
        .addColumn('username', 'text')
        .addColumn('linkedAt', 'bigint', (c) => c.notNull())
        .execute();
    },
  },
  {
    version: 5,
    name: 'schedule, guests, jobs, audit and club identity',
    async up(db) {
      await db.schema
        .createTable('club')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('name', 'text', (c) => c.notNull())
        .addColumn('tagline', 'text')
        .addColumn('accent', 'text', (c) => c.notNull())
        .addColumn('logo', 'text')
        .addColumn('listed', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('locale', 'text')
        .addColumn('timezone', 'text')
        .addColumn('updatedAt', 'bigint', (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('schedule')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('title', 'text', (c) => c.notNull())
        .addColumn('description', 'text')
        .addColumn('kind', 'text', (c) => c.notNull())
        .addColumn('location', 'text')
        .addColumn('capacity', 'integer')
        .addColumn('seasonId', 'text', (c) => c.references('season.id').onDelete('set null'))
        .addColumn('startsAt', 'bigint', (c) => c.notNull())
        .addColumn('minutes', 'integer')
        .addColumn('freq', 'text', (c) => c.notNull())
        .addColumn('interval', 'integer', (c) => c.notNull())
        .addColumn('count', 'integer')
        .addColumn('until', 'bigint')
        .addColumn('createdBy', 'text', (c) => c.notNull().references('member.id'))
        .addColumn('createdAt', 'bigint', (c) => c.notNull())
        .execute();

      /**
       * Two statements rather than one: SQLite adds a single column per `alter table`, and a
       * migration that works on one dialect only is not a migration.
       */
      await db.schema
        .alterTable('event')
        .addColumn('scheduleId', 'text', (c) => c.references('schedule.id').onDelete('set null'))
        .execute();
      await db.schema
        .alterTable('event')
        .addColumn('listed', 'integer', (c) => c.notNull().defaultTo(0))
        .execute();
      await db.schema.createIndex('event_schedule').on('event').column('scheduleId').execute();

      await db.schema
        .createTable('guest')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('eventId', 'text', (c) => c.notNull().references('event.id').onDelete('cascade'))
        .addColumn('name', 'text', (c) => c.notNull())
        .addColumn('email', 'text')
        .addColumn('invitedBy', 'text', (c) => c.notNull().references('member.id'))
        .addColumn('attendedAt', 'bigint')
        .addColumn('createdAt', 'bigint', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('guest_event').on('guest').column('eventId').execute();

      await db.schema
        .createTable('job')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('kind', 'text', (c) => c.notNull())
        .addColumn('payload', 'text', (c) => c.notNull())
        .addColumn('subject', 'text')
        .addColumn('runAt', 'bigint', (c) => c.notNull())
        .addColumn('state', 'text', (c) => c.notNull())
        .addColumn('attempts', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('error', 'text')
        .addColumn('createdAt', 'bigint', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('job_due').on('job').columns(['state', 'runAt']).execute();

      await db.schema
        .createTable('audit')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('act', 'text', (c) => c.notNull())
        .addColumn('actorId', 'text', (c) => c.references('member.id').onDelete('set null'))
        .addColumn('subject', 'text')
        .addColumn('detail', 'text', (c) => c.notNull())
        .addColumn('at', 'bigint', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('audit_at').on('audit').column('at').execute();
      await db.schema.createIndex('audit_subject').on('audit').column('subject').execute();

      await db.schema
        .createTable('preference')
        .addColumn('memberId', 'text', (c) => c.primaryKey().references('member.id').onDelete('cascade'))
        .addColumn('telegram', 'integer', (c) => c.notNull().defaultTo(1))
        .addColumn('email', 'integer', (c) => c.notNull().defaultTo(1))
        .addColumn('announcements', 'integer', (c) => c.notNull().defaultTo(1))
        .addColumn('reminders', 'integer', (c) => c.notNull().defaultTo(1))
        .execute();
    },
  },
  {
    version: 6,
    name: 'job leases and one occurrence per schedule',
    async up(db) {
      /**
       * When a job was claimed, so a process that died mid-run can have its work handed back.
       * Without it a redeploy strands a batch in `running` where nothing retries it and nobody
       * can see it, which is the exact failure the queue exists to prevent.
       */
      await db.schema.alterTable('job').addColumn('claimedAt', 'bigint').execute();

      /**
       * One occurrence per schedule per instant. Two expansions racing (a restart's top-up against
       * a double-clicked button) would otherwise create every night twice, each with its own
       * answers. Rows with no schedule are unaffected: null is distinct from null in both dialects.
       */
      await db.schema
        .createIndex('event_occurrence')
        .unique()
        .on('event')
        .columns(['scheduleId', 'startsAt'])
        .execute();
    },
  },
  {
    version: 7,
    name: 'a schedule says whether its occurrences are public',
    async up(db) {
      /** A weekly meeting is exactly what a public page is for, so the rule carries the flag. */
      await db.schema
        .alterTable('schedule')
        .addColumn('listed', 'integer', (c) => c.notNull().defaultTo(0))
        .execute();
    },
  },
  {
    version: 8,
    name: 'a club designs its own site, uploads its images and says who may join',
    async up(db) {
      /**
       * SQLite adds one column per statement, so each of these is its own `alterTable`. They are
       * all nullable with no default on purpose: null means "this club has not chosen", and
       * `Design` turns that into the default at read time, in one place, for every release.
       */
      for (const column of ['palette', 'font', 'radius', 'density', 'banner', 'blurb'] as const) {
        await db.schema.alterTable('club').addColumn(column, 'text').execute();
      }

      /** Which eduID home organisations may sign in. Null or empty is everybody. */
      await db.schema.alterTable('club').addColumn('organisations', 'text').execute();

      /**
       * Images, base64 in a text column. A blob is the one type the two dialects hand back
       * differently, and this app's promise is that Postgres is a url change.
       */
      await db.schema
        .createTable('asset')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('mime', 'text', (c) => c.notNull())
        .addColumn('body', 'text', (c) => c.notNull())
        .addColumn('bytes', 'integer', (c) => c.notNull())
        .addColumn('uploadedBy', 'text', (c) => c.notNull().references('member.id').onDelete('cascade'))
        .addColumn('uploadedAt', 'bigint', (c) => c.notNull())
        .execute();
    },
  },
  {
    version: 9,
    name: 'a club keeps its own vocabulary for what an event is',
    async up(db) {
      await db.schema
        .createTable('kind')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('label', 'text', (c) => c.notNull())
        .addColumn('position', 'integer', (c) => c.notNull())
        .execute();

      /**
       * The starter vocabulary, with ids that are exactly the values this app used to accept as a
       * union. Every event and schedule already stamped points at one of these, so a club that
       * upgrades finds its history intact and its menu unchanged, and can then rename any of it.
       */
      await db
        .insertInto('kind')
        .values(
          Kind.DEFAULTS.map((one, index) => ({
            id: one.id as KindId,
            label: one.label,
            position: (index + 1) * Kind.STEP,
          })),
        )
        .execute();
    },
  },
  {
    version: 10,
    name: 'a club decides whether a new arrival waits to be let in',
    async up(db) {
      /**
       * Null rather than a default, and read as `review`: a column added to an existing club must
       * not change what that club does. Every deployment that upgrades keeps making new arrivals
       * wait, and turns that off on purpose or not at all.
       */
      await db.schema.alterTable('club').addColumn('admission', 'text').execute();
    },
  },
  {
    version: 11,
    name: 'a club styles its site with measures rather than three words',
    async up(db) {
      for (const column of ['corner', 'space', 'hue', 'tint', 'scale', 'motion', 'showcase'] as const) {
        await db.schema.alterTable('club').addColumn(column, 'integer').execute();
      }
      for (const column of ['width', 'display', 'links', 'footer'] as const) {
        await db.schema.alterTable('club').addColumn(column, 'text').execute();
      }

      /**
       * What the old words were worth, written into the new numbers, so a club that had chosen
       * `sharp` corners and a `roomy` page keeps exactly that and finds a slider sitting where it
       * left the word. The old columns stay: this release stops writing them, and a rollback to
       * the previous one finds its own values intact.
       */
      const Corners: Record<string, number> = { sharp: 0, soft: 8, round: 16 };
      const Spaces: Record<string, number> = { compact: 75, cosy: 100, roomy: 135 };

      const club = await db.selectFrom('club').select(['id', 'radius', 'density']).executeTakeFirst();
      if (!club) return;

      await db
        .updateTable('club')
        .set({
          corner: Corners[club.radius ?? ''] ?? Design.CORNER.value,
          space: Spaces[club.density ?? ''] ?? Design.SPACE.value,
        })
        .where('id', '=', club.id)
        .execute();
    },
  },
  {
    version: 12,
    name: 'a club decides who may join and how its evenings run',
    async up(db) {
      for (const column of ['domains', 'allowed', 'blocked', 'providers'] as const) {
        await db.schema.alterTable('club').addColumn(column, 'text').execute();
      }
      for (const column of ['deadline', 'remind', 'guests', 'waitlist'] as const) {
        await db.schema.alterTable('club').addColumn(column, 'integer').execute();
      }
    },
  },
  {
    version: 13,
    name: 'a club may name the colour of its own paper',
    async up(db) {
      await db.schema.alterTable('club').addColumn('paper', 'text').execute();
    },
  },
  {
    version: 14,
    name: 'a member keeps the institution they signed in from',
    async up(db) {
      await db.schema.alterTable('member').addColumn('organisation', 'text').execute();
    },
  },
  {
    version: 15,
    name: 'an organisation says which provider names it',
    /**
     * Until now the only provider that named an organisation was eduID, so every entry a club had
     * written meant one of its home domains. A second provider that names organisations makes a
     * bare entry ambiguous, and ambiguity in a door is a way through it: `acme` at one provider is
     * not `acme` at another, and a club that wrote down a university must not be opened by somebody
     * who made an organisation with the same name somewhere else.
     *
     * So every entry is qualified with the provider it always meant. Nothing is dropped and no
     * club's door changes who it lets in, which is the only acceptable outcome for a migration that
     * touches this column.
     */
    async up(db) {
      const row = await db
        .selectFrom('club')
        .select(['id', 'organisations'])
        .where('id', '=', 'club')
        .executeTakeFirst();

      const line = (row as { organisations?: string | null } | undefined)?.organisations;
      if (!line) return;

      const qualified = line
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
        .map((entry) => (entry.includes(':') ? entry : `eduid:${entry}`))
        .join(',');

      await db.updateTable('club').set({ organisations: qualified }).where('id', '=', 'club').execute();
    },
  },
  {
    version: 16,
    name: 'the club row exists from the start, so an enrolment has something to queue behind',
    /**
     * The club is the singleton every enrolment reads through, and `Lock.club` holds it so that
     * two first-ever sign-ins cannot both decide they are the founder. Nothing created it: the row
     * appeared on the first settings save, so until a committee had saved that page the lock was
     * `SELECT … FOR UPDATE` over an empty table, which locks nothing and waits for nobody. Two
     * people finishing OAuth in the same second both came out `admin`, permanently.
     *
     * Every column but the three the table requires stays null, which is what every reader already
     * treats as "this club has not chosen": the row decodes to exactly what `Club.default()`
     * returns, so no club's page changes on upgrade.
     */
    async up(db) {
      const existing = await db.selectFrom('club').select('id').where('id', '=', Club.ROW).executeTakeFirst();
      if (existing) return;

      const club = Club.default();
      await db
        .insertInto('club')
        .values({
          id: Club.ROW,
          name: club.name,
          accent: club.design.accent,
          listed: Row.bit(club.listed),
          updatedAt: Row.ms(club.updatedAt),
        })
        .execute();
    },
  },
  {
    version: 17,
    name: 'signing in with an address alone',
    /**
     * One row per attempt to sign in by email, holding the digests of the two things that redeem
     * it and never the things themselves: a link carries a long token, a page carries a short
     * code, and either spends the same row. A leaked database is then a list of addresses that
     * asked to sign in, not a list of ways to become them.
     *
     * `tries` is what makes six digits safe: a code has a million values and a row that has been
     * guessed at too often is spent, so the number is a budget rather than a hope.
     */
    async up(db) {
      await db.schema
        .createTable('signin')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('email', 'text', (c) => c.notNull())
        .addColumn('token', 'text', (c) => c.notNull().unique())
        .addColumn('code', 'text', (c) => c.notNull())
        .addColumn('tries', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('expiresAt', 'bigint', (c) => c.notNull())
        .addColumn('usedAt', 'bigint')
        .execute();
      await db.schema.createIndex('signin_email').on('signin').column('email').execute();
    },
  },
  {
    version: 18,
    name: 'an event entered in teams',
    /**
     * Per event, because a club runs both kinds: a CTF night is teams and the AGM is not. The
     * three settings are nullable with no default, so every event that already exists keeps
     * behaving exactly as it did and a committee turns teams on where they want them.
     */
    async up(db) {
      await db.schema.alterTable('event').addColumn('teams', 'integer').execute();
      await db.schema.alterTable('event').addColumn('teamSize', 'integer').execute();
      await db.schema.alterTable('event').addColumn('teamsBy', 'text').execute();

      await db.schema
        .createTable('team')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('eventId', 'text', (c) => c.notNull().references('event.id').onDelete('cascade'))
        .addColumn('name', 'text', (c) => c.notNull())
        .addColumn('captainId', 'text', (c) => c.notNull().references('member.id').onDelete('cascade'))
        .addColumn('createdAt', 'bigint', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('team_event').on('team').column('eventId').execute();

      /**
       * One member, one team per event. The primary key says so rather than a check in a route,
       * because two routes would have to agree about it and the column cannot disagree with itself.
       */
      await db.schema
        .createTable('teammate')
        .addColumn('teamId', 'text', (c) => c.notNull().references('team.id').onDelete('cascade'))
        .addColumn('eventId', 'text', (c) => c.notNull().references('event.id').onDelete('cascade'))
        .addColumn('memberId', 'text', (c) => c.notNull().references('member.id').onDelete('cascade'))
        .addColumn('joinedAt', 'bigint', (c) => c.notNull())
        .addPrimaryKeyConstraint('teammate_pk', ['eventId', 'memberId'])
        .execute();
      await db.schema.createIndex('teammate_team').on('teammate').column('teamId').execute();
    },
  },
  {
    version: 19,
    name: 'a first run, for a member and for the club',
    /**
     * Both nullable, and both meaning "has not happened yet". An existing deployment is a club
     * somebody already set up and members who already know their way round, so stamping either
     * column on upgrade would show everybody a welcome for a thing they have been using for a
     * year. The absent value is the truthful one for a new arrival only.
     */
    async up(db) {
      await db.schema.alterTable('member').addColumn('welcomedAt', 'bigint').execute();
      await db.schema.alterTable('club').addColumn('setupAt', 'bigint').execute();

      /** Every club that already has members has been set up, whatever it has saved. */
      const members = await db
        .selectFrom('member')
        .select(({ fn }) => fn.countAll<number>().as('total'))
        .executeTakeFirst();
      if (Number(members?.total ?? 0) === 0) return;

      await db.updateTable('club').set({ setupAt: Date.now() }).where('id', '=', Club.ROW).execute();
      await db.updateTable('member').set({ welcomedAt: Date.now() }).execute();
    },
  },
  {
    version: 20,
    name: 'the sites a club lets embed its events',
    /**
     * Null, which reads as none: a page nobody named may not be framed anywhere. An allow-list
     * rather than a flag, because "may this be embedded" is not the question a browser asks; it
     * asks which origins, and answering it with `*` is answering a different one.
     */
    async up(db) {
      await db.schema.alterTable('club').addColumn('embeds', 'text').execute();
    },
  },
  {
    version: 21,
    name: 'the chat group a member is invited into',
    /** Null is a club that runs no group, which is most of them until somebody sets one up. */
    async up(db) {
      await db.schema.alterTable('club').addColumn('group', 'text').execute();
    },
  },
  {
    version: 22,
    name: 'a member may keep the name they chose',
    /**
     * Null everywhere on upgrade, which is the truthful value: nobody has chosen a name yet, and
     * every existing row still carries whatever their provider last said. From here on, a member
     * who edits their own name stamps this column and the provider stops overwriting it, because
     * a name that reverts at the next sign-in is not a name a member can change.
     */
    async up(db) {
      await db.schema.alterTable('member').addColumn('renamedAt', 'bigint').execute();
    },
  },
];
