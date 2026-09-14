import { Providers } from '@clubbie/auth';
import {
  ACTS,
  Asset,
  Audit,
  Club,
  Design,
  Event,
  Guest,
  Id,
  Job,
  Kind,
  type KindId,
  Locale,
  Member,
  type Range,
  Recur,
  Rsvp,
  Team,
  Zone,
} from '@clubbie/core';
import { markup } from '@clubbie/term';
import * as v from 'valibot';

/**
 * Every request body and query the API accepts, declared once. The SPA imports these to validate
 * a form before it is sent, so a field cannot be optional in the browser and required on the
 * server. The unions come from the domain's own lists, so adding an event kind is one edit.
 */
export namespace Input {
  export const TITLE = 200;
  export const TEXT = 5000;
  export const TOKEN = 200;
  /**
   * An authorisation code, which is the one string here that another system chose the length of.
   *
   * It is not `TOKEN`. That bound fits the things this app mints (a state, a verifier, a calendar
   * token) and an authorisation code is whatever the provider encoded into it: eduID's is around
   * seven hundred characters and Entra's longer still, so a two hundred character limit refused
   * every eduID sign-in at the callback with a schema error. It is still bounded, because it is
   * still somebody else's string arriving in a url.
   */
  export const GRANT = 4096;
  /** A CSS colour as a hex triple, which is the only form the SPA's token needs to accept. */
  export const COLOUR = /^#[0-9a-fA-F]{6}$/;
  /**
   * An IANA zone, checked twice: the shape here, and whether the runtime has ever heard of it in
   * `Zone.valid`. A zone that only passes the first check would be accepted by the settings page
   * and then silently ignored by every schedule that stepped in it.
   */
  export const TIMEZONE = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/;
  /**
   * A title is one line. A line break in one reaches an email subject and the first line of a chat
   * message, where it breaks the markup span it sits inside and prints the delimiters raw.
   */
  export const LINE = /^[^\r\n]*$/;

  const literals = <T extends string>(values: readonly T[]) => v.picklist(values as readonly [T, ...T[]]);

  /**
   * A kind is one of the club's own, so this checks the shape and the route checks the row: a
   * closed list here would be the app deciding what a club may call its evenings.
   */
  export const slug = v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.check(Kind.is, 'expected a kind like `workshop`'),
    v.transform((value) => value as KindId),
  );

  /** An instant crosses the wire as ISO 8601 and is parsed here, never by a handler. */
  export const instant = v.pipe(
    v.string(),
    v.isoTimestamp('expected an ISO 8601 timestamp'),
    v.transform((value) => new Date(value)),
  );

  /** An id is checked for shape here, so a handler never casts a bare string into a typed id. */
  export const id = <K extends string>() =>
    v.pipe(
      v.string(),
      v.check((value) => Id.valid(value), 'expected an id'),
      v.transform((value) => value as Id<K>),
    );

  export const seasonId = id<'season'>();

  /**
   * Path parameters, validated like everything else. A route reads `c.req.valid('param')` and
   * receives a branded id that `Id.valid` has actually checked, so no handler casts a bare string
   * into one and no malformed id reaches a query.
   */
  export const params = {
    event: v.object({ id: id<'event'>() }),
    member: v.object({ id: id<'member'>() }),
    season: v.object({ id: id<'season'>() }),
    schedule: v.object({ id: id<'schedule'>() }),
    kind: v.object({ id: slug }),
    job: v.object({ id: id<'job'>() }),
    asset: v.object({ id: id<'asset'>() }),
    eventMember: v.object({ id: id<'event'>(), memberId: id<'member'>() }),
    eventGuest: v.object({ id: id<'event'>(), guestId: id<'guest'>() }),
    eventTeam: v.object({ id: id<'event'>(), teamId: id<'team'>() }),
    seasonMember: v.object({ id: id<'season'>(), memberId: id<'member'>() }),
    /** The calendar token, which is a member id and a signature and is checked by `Feed`. */
    feed: v.object({ token: v.pipe(v.string(), v.minLength(1), v.maxLength(TOKEN)) }),
    /**
     * A sign-in provider the app knows how to be. Whether this deployment has credentials for it
     * is a different question, answered by `Auth` with a refusal that names the ones it has.
     */
    provider: v.object({ provider: literals(Providers.NAMES) }),
    /** The token in a sign-in link. Base64url, and bounded like every other thing a stranger sends. */
    signin: v.object({
      token: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]+$/, 'expected a token'), v.maxLength(TITLE)),
    }),
  } as const;

  /**
   * What a provider sends a member back with. It is the one input the app does not shape, so it is
   * bounded here like everything else rather than forwarded at whatever length it arrived.
   */
  export const callback = v.object({
    code: v.optional(v.pipe(v.string(), v.maxLength(GRANT))),
    state: v.optional(v.pipe(v.string(), v.maxLength(TOKEN))),
    error: v.optional(v.pipe(v.string(), v.maxLength(TITLE))),
  });

  /** The flow parked in a signed cookie, re-checked on the way out: a cookie is still input. */
  export const flow = v.object({
    provider: literals(Providers.NAMES),
    state: v.pipe(v.string(), v.minLength(1), v.maxLength(TOKEN)),
    verifier: v.pipe(v.string(), v.minLength(1), v.maxLength(TOKEN)),
  });

  /**
   * A verified Telegram identity, parked while the member proves an address. Telegram releases
   * no address and a member is keyed on one, so the chat waits for the mail rather than enrolling.
   */
  export const chatter = v.object({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(TOKEN)),
    name: v.pipe(v.string(), v.maxLength(TITLE)),
    username: v.nullable(v.pipe(v.string(), v.maxLength(TITLE))),
  });

  /** What the Telegram widget posts back. Its own fields are whatever Telegram decided to sign. */
  export const login = v.record(v.string(), v.union([v.string(), v.number()]));

  /** What every heading a member types has to satisfy: one line, not empty, not endless. */
  export const heading = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(TITLE),
    v.regex(LINE, 'a title is one line'),
  );

  export const kind = slug;

  export const kinds = v.object({
    label: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1),
      v.maxLength(Kind.LABEL),
      v.regex(LINE, 'a label is one line'),
    ),
    /** Optional: a club that does not care gets a slug made from the label. */
    id: v.optional(slug),
  });

  export const kindPatch = v.object({
    label: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        v.minLength(1),
        v.maxLength(Kind.LABEL),
        v.regex(LINE, 'a label is one line'),
      ),
    ),
    position: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  });
  export const state = literals(Event.STATES);
  export const answer = literals(Rsvp.ANSWERS);
  export const role = literals(Member.ROLES);
  export const status = literals(Member.STATUSES);

  export const profile = v.object({
    name: v.optional(heading),
    hidden: v.optional(v.boolean()),
  });

  export const membership = v.object({
    role: v.optional(role),
    status: v.optional(status),
  });

  /**
   * The same edit, to several members at once.
   *
   * Bounded, because it is the one request in the app whose cost is the caller's to choose: a
   * committee admitting a term's worth of new arrivals is a page of them, not ten thousand.
   */
  export const memberships = v.object({
    ids: v.pipe(v.array(id<'member'>()), v.minLength(1), v.maxLength(Member.BATCH)),
    role: v.optional(role),
    status: v.optional(status),
  });

  /** What a search box sends. Long enough for a name, short enough that a scan stays a scan. */
  export const term = v.pipe(v.string(), v.trim(), v.maxLength(TITLE));

  /**
   * How far into a listing a caller may page. Deep enough that nobody meets it by scrolling, and
   * shallow enough that it is not a full table scan a stranger can ask for repeatedly.
   */
  export const DEEPEST = 10_000;

  /**
   * What a paged report asks for: a window, and where it starts.
   *
   * The ceiling is the caller's, because a page of the queue and a page of the trail are different
   * numbers and each concept owns its own. It used to be `Audit.PAGE` for everybody, so the jobs
   * screen was bounded by the trail's number and changing either quietly changed the other.
   */
  export const page = (max: number) =>
    v.object({
      limit: v.optional(v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(max))),
      /**
       * Bounded at both ends, like the window itself. Both dialects answer a large `offset` by
       * walking and discarding every row before it, so `?offset=999999999999` was a full scan per
       * request on every listing a member can reach.
       */
      offset: v.optional(
        v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(0), v.maxValue(DEEPEST)),
      ),
    });

  /**
   * What the jobs screen asks for: a page of the queue, narrowed to one state or one kind. Both
   * unions are the domain's own, so a filter cannot ask for a state the queue does not have.
   */
  export const jobQuery = v.object({
    ...page(Job.PAGE).entries,
    state: v.optional(literals(Job.STATES)),
    kind: v.optional(literals(Job.KINDS)),
  });

  export const memberQuery = v.object({
    ...page(Member.PAGE).entries,
    status: v.optional(status),
    role: v.optional(role),
    q: v.optional(term),
  });

  export const event = v.object({
    title: heading,
    description: v.nullish(v.pipe(v.string(), v.maxLength(TEXT))),
    kind,
    state: v.optional(state),
    startsAt: instant,
    endsAt: v.nullish(instant),
    closesAt: v.nullish(instant),
    location: v.nullish(v.pipe(v.string(), v.maxLength(TITLE))),
    capacity: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1))),
    seasonId: v.nullish(seasonId),
    /** Whether a signed-out visitor may see it, which only matters when the club is listed too. */
    listed: v.optional(v.boolean()),
    /** Teams, per event, because a club runs both kinds of evening. */
    teams: v.optional(v.boolean()),
    teamSize: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Team.LIMIT))),
    teamsBy: v.optional(literals(Team.MAKERS)),
  });

  export const eventPatch = v.partial(event);

  /** What a listing may ask for. Absent means upcoming, which is what a member wants to see. */
  export const SCOPES = ['upcoming', 'all'] as const;
  export type Scope = (typeof SCOPES)[number];

  export const eventQuery = v.pipe(
    v.object({
      ...page(Event.PAGE).entries,
      state: v.optional(state),
      kind: v.optional(kind),
      seasonId: v.optional(seasonId),
      /**
       * Absent means upcoming, and says so here rather than in a handler. It used to mean "upcoming,
       * unless a search word is present", which is a third value that never appeared in `SCOPES` and
       * so never reached the types the browser is built from: a client that added a search box
       * started answering with history without asking for it.
       */
      scope: v.optional(literals(SCOPES), 'upcoming'),
      q: v.optional(term),
      /**
       * The stretch of the clock a calendar is drawing. It outranks `scope`, because a page showing
       * last March is asking for last March and would otherwise be answered with an empty grid.
       */
      from: v.optional(instant),
      to: v.optional(instant),
    }),
    /**
     * Half a window is a mistake worth naming. `from` alone is what `scope=all` already answers and
     * `to` alone asks for the whole of recorded history up to a date, so neither is accepted
     * quietly: a client that dropped one of the two hears about it instead of drawing a wrong month.
     */
    v.check(
      (query) => (query.from === undefined) === (query.to === undefined),
      'a window needs `from` and `to`, or neither',
    ),
    v.check(
      (query) => query.from === undefined || query.to === undefined || query.from < query.to,
      '`from` comes before `to`',
    ),
  );

  export const rsvp = v.object({ answer });

  export const attendance = v.object({ attended: v.boolean() });

  export const season = v.object({
    name: heading,
    startsAt: instant,
    endsAt: instant,
    renewalAt: v.nullish(instant),
    current: v.optional(v.boolean()),
  });

  export const guest = v.object({
    name: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1),
      v.maxLength(Guest.NAME),
      v.regex(LINE, 'a name is one line'),
    ),
    email: v.nullish(v.pipe(v.string(), v.maxLength(TITLE), v.email('expected an email address'))),
  });

  export const schedule = v.object({
    title: heading,
    description: v.nullish(v.pipe(v.string(), v.maxLength(TEXT))),
    kind,
    location: v.nullish(v.pipe(v.string(), v.maxLength(TITLE))),
    capacity: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1))),
    seasonId: v.nullish(seasonId),
    startsAt: instant,
    /** How long one occurrence lasts. Null is an event with a start and no end, as ever. */
    minutes: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1))),
    freq: literals(Recur.FREQUENCIES),
    interval: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Recur.LIMIT))),
    count: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Recur.LIMIT))),
    until: v.nullish(instant),
    listed: v.optional(v.boolean()),
  });

  /** Every field of a schedule is optional in a patch, including the rule it repeats by. */
  export const schedulePatch = v.partial(schedule);

  /**
   * An image the club points at: either an absolute url somewhere else, or one of its own uploads
   * under `Asset.PATH`. Nothing else is accepted, so a stored value can never be a `javascript:`
   * or a `data:` that a browser would run when the page renders it.
   */
  export const image = v.pipe(
    v.string(),
    v.maxLength(TEXT),
    v.check(
      (value) => value.startsWith(`${Asset.PATH}/`) || /^https:\/\/\S+$/.test(value),
      markup`expected an \`https\` url or an uploaded image`,
    ),
  );

  /** The shape of a domain, and of an organisation. `Club` owns both: the settings page checks them. */
  export const DOMAIN = Club.DOMAIN;
  export const ORGANISATION = Club.ORGANISATION;
  /** Deliberately loose: an address is whatever a provider says it is, with an `@` in the middle. */
  export const EMAIL = Club.ADDRESS;

  /** A domain, as every list of them wants it: trimmed, lowercased, and shaped like one. */
  const domain = v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.regex(DOMAIN, 'expected a domain like `ethz.ch`'),
  );

  /**
   * An organisation, qualified by the provider that names it. The qualifier is not decoration: it
   * is what stops an organisation at one provider opening a door written for another.
   */
  const organisation = v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.regex(ORGANISATION, 'expected an organisation like `eduid:ethz.ch` or `github:acme`'),
  );

  /** One address. The same shape the providers hand us, which is what the lists are compared to. */
  const address = v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.maxLength(TITLE),
    v.regex(EMAIL, 'expected an address like `ada@ethz.ch`'),
  );

  /** One of the design's measures: a whole number, inside the range `Design` published for it. */
  function measure(range: Range) {
    return v.pipe(v.number(), v.integer(), v.minValue(range.min), v.maxValue(range.max));
  }

  export const club = v.object({
    name: v.optional(heading),
    tagline: v.nullish(v.pipe(v.string(), v.trim(), v.maxLength(TITLE))),
    logo: v.nullish(image),
    listed: v.optional(v.boolean()),
    /** Every design choice is a name from a closed list, so a page cannot be asked to be banana. */
    accent: v.optional(
      v.pipe(v.string(), v.regex(COLOUR, markup`expected a colour like \`${Design.ACCENT}\``)),
    ),
    /** Null puts the mixed neutral back, which is what clearing the field means. */
    paper: v.nullish(
      v.pipe(v.string(), v.regex(COLOUR, markup`expected a colour like \`${Design.ACCENT}\``)),
    ),
    palette: v.optional(literals(Design.PALETTES)),
    font: v.optional(literals(Design.FONTS)),
    display: v.optional(literals(Design.FONTS)),
    width: v.optional(literals(Design.WIDTHS)),
    corner: v.optional(measure(Design.CORNER)),
    space: v.optional(measure(Design.SPACE)),
    hue: v.optional(measure(Design.HUE)),
    tint: v.optional(measure(Design.TINT)),
    scale: v.optional(measure(Design.SCALE)),
    motion: v.optional(v.boolean()),
    links: v.optional(
      v.pipe(
        v.array(
          v.object({
            label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(Design.LABEL)),
            /** Somewhere else over TLS, or somewhere in this app: never `javascript:`. */
            url: v.pipe(
              v.string(),
              v.trim(),
              v.maxLength(TITLE),
              v.check(Design.reachable, markup`expected an \`https\` url or a path like \`/events\``),
            ),
          }),
        ),
        v.maxLength(Design.LINKS),
      ),
    ),
    footer: v.nullish(v.pipe(v.string(), v.trim(), v.maxLength(Design.FOOTER))),
    banner: v.nullish(image),
    blurb: v.nullish(v.pipe(v.string(), v.trim(), v.maxLength(Design.BLURB))),
    organisations: v.optional(v.pipe(v.array(organisation), v.maxLength(Club.LISTS))),
    domains: v.optional(v.pipe(v.array(domain), v.maxLength(Club.LISTS))),
    /** An address is a whole address here, not a pattern: a list of people, not of shapes. */
    allowed: v.optional(v.pipe(v.array(address), v.maxLength(Club.LISTS))),
    blocked: v.optional(v.pipe(v.array(address), v.maxLength(Club.LISTS))),
    /** A provider this deployment configured. An unknown name would close the door on everybody. */
    providers: v.optional(
      v.pipe(
        v.array(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.maxLength(TITLE))),
        v.maxLength(Club.LISTS),
      ),
    ),
    /** Sites that may frame the club's events widget, each a scheme and a host. */
    embeds: v.optional(
      v.pipe(
        v.array(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.regex(Club.ORIGIN, 'expected an origin'))),
        v.maxLength(Club.LISTS),
      ),
    ),
    /** The chat group members are invited into, as its numeric id or its `@name`. */
    group: v.nullish(v.pipe(v.string(), v.trim(), v.maxLength(TITLE), v.regex(LINE, 'one line'))),
    /** Whether a first sign-in waits for an organiser. A closed list, like every other choice. */
    admission: v.optional(literals(Club.ADMISSIONS)),
    deadline: v.optional(measure(Club.DEADLINES)),
    remind: v.optional(measure(Club.REMINDERS)),
    guests: v.optional(v.boolean()),
    waitlist: v.optional(v.boolean()),
    /** A closed list, because a language the app has no catalogue for is a page half in English. */
    locale: v.nullish(literals(Locale.LANGUAGES)),
    timezone: v.nullish(
      v.pipe(
        v.string(),
        v.regex(TIMEZONE, 'expected a zone like `Europe/Zurich`'),
        v.check(Zone.valid, 'this runtime has never heard of that zone'),
      ),
    ),
  });

  export const prefs = v.object({
    telegram: v.optional(v.boolean()),
    email: v.optional(v.boolean()),
    announcements: v.optional(v.boolean()),
    reminders: v.optional(v.boolean()),
  });

  export const auditQuery = v.object({
    act: v.optional(v.picklist(ACTS)),
    /** A subject is an id, and was the one field in this file with no bound at all. */
    subject: v.optional(v.pipe(v.string(), v.maxLength(TITLE))),
    ...page(Audit.PAGE).entries,
  });

  /** What the roll-over of a season takes: which season the members come from. */
  export const rollover = v.object({ from: seasonId });

  /** What a team is called. One line, like every other name a member types. */
  export const team = v.object({
    name: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1),
      v.maxLength(Team.NAME),
      v.regex(LINE, 'a team name is one line'),
    ),
  });

  /** An address asking to sign in, bounded like every other address the app takes. */
  export const signin = v.object({ email: address });

  /** The code from a sign-in mail, with whatever spacing was copied along with it. */
  export const code = v.object({
    email: address,
    code: v.pipe(v.string(), v.maxLength(TITLE)),
  });
}
