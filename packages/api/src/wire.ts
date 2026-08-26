import type {
  Ability,
  Audit,
  Club,
  Event,
  Guest,
  Job,
  Kind,
  Member,
  Prefs,
  Rsvp,
  Schedule,
  Season,
} from '@clubbie/core';
import { Asset } from '@clubbie/core';
import type { Entry, Tally } from '@clubbie/store';
import { Expand } from './expand.ts';

/**
 * The JSON shape of every domain object, and the only place a `Date` becomes a string. Instants
 * go out as ISO 8601 because that is what `new Date(...)` reads back without a format argument,
 * and the SPA's types are inferred from these functions rather than declared a second time.
 */
export namespace Wire {
  export function member(member: Member) {
    return {
      id: member.id,
      name: member.name,
      email: member.email,
      avatar: member.avatar,
      organisation: member.organisation,
      role: member.role,
      status: member.status,
      hidden: member.hidden,
      createdAt: member.createdAt.toISOString(),
    };
  }

  /** What a member may see of another member. An email is contact detail, not a public field. */
  export function peer(member: Member) {
    const { email, organisation, ...rest } = Wire.member(member);
    return rest;
  }

  /**
   * A member on the roster: a peer, plus the address for whoever runs the club.
   *
   * The store already decides that only `member:manage` may *search* by email; sending it too is
   * what makes that useful. Without it an admin could find somebody by typing their address and
   * then not see the address they had just typed, and had to open the CSV export to read it.
   */
  export function listed(member: Member, emails: boolean) {
    return emails ? Wire.member(member) : { ...Wire.peer(member), email: null, organisation: null };
  }

  export function event(event: Event) {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      kind: event.kind,
      state: event.state,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      closesAt: event.closesAt?.toISOString() ?? null,
      deadline: event.deadline.toISOString(),
      location: event.location,
      capacity: event.capacity,
      seasonId: event.seasonId,
      scheduleId: event.scheduleId,
      listed: event.listed,
      createdBy: event.createdBy,
      createdAt: event.createdAt.toISOString(),
      open: event.open(),
      past: event.past(),
    };
  }

  /** What a signed-out visitor sees of an event: when and where, and nothing about who. */
  /**
   * An event as a stranger reads it. The kind is resolved to the club's own word here, because a
   * visitor has no session to read the vocabulary with and `workshop` is an id, not a label.
   */
  export function billboard(event: Event, kind: string = event.kind) {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      kind,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      location: event.location,
    };
  }

  export function tally(tally: Tally) {
    return {
      ...Wire.event(tally.event),
      going: tally.going,
      maybe: tally.maybe,
      waiting: tally.waiting,
      guests: tally.guests,
      taken: tally.taken,
      attended: tally.attended,
    };
  }

  export function rsvp(rsvp: Rsvp) {
    return {
      eventId: rsvp.eventId,
      memberId: rsvp.memberId,
      answer: rsvp.answer,
      attendedAt: rsvp.attendedAt?.toISOString() ?? null,
      answeredAt: rsvp.answeredAt.toISOString(),
    };
  }

  export function entry(entry: Entry) {
    return { ...Wire.rsvp(entry.rsvp), member: Wire.peer(entry.member) };
  }

  /** One line of a member's own history: what they answered, and which event it was. */
  export function moment(moment: { rsvp: Rsvp; event: Event }) {
    return { ...Wire.rsvp(moment.rsvp), event: Wire.event(moment.event) };
  }

  export function guest(guest: Guest) {
    return {
      id: guest.id,
      eventId: guest.eventId,
      name: guest.name,
      email: guest.email,
      invitedBy: guest.invitedBy,
      attendedAt: guest.attendedAt?.toISOString() ?? null,
      createdAt: guest.createdAt.toISOString(),
    };
  }

  /**
   * What a member sees of somebody else's guest: a name on the list, and nothing more. A guest
   * never held an account and never agreed to anything, so their address is the one contact detail
   * in the app nobody chose to publish. Who invited them is the organiser's business too.
   */
  export function attendee(guest: Guest) {
    const { email, invitedBy, ...rest } = Wire.guest(guest);
    return rest;
  }

  export function kind(kind: Kind) {
    return { id: kind.id, label: kind.label, position: kind.position };
  }

  /**
   * An image the club uploaded. The url rather than the bytes: the file is served by its own
   * route, and a settings page wants to show it, not to hold it.
   */
  export function asset(asset: Asset) {
    return {
      id: asset.id,
      url: Asset.url(asset.id),
      mime: asset.mime,
      bytes: asset.bytes,
      uploadedAt: asset.uploadedAt.toISOString(),
    };
  }

  export function season(season: Season) {
    return {
      id: season.id,
      name: season.name,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      current: season.current,
      renewalAt: season.renewalAt?.toISOString() ?? null,
      createdAt: season.createdAt.toISOString(),
    };
  }

  /** How many upcoming dates a schedule shows, which is enough to recognise a rule and no more. */
  export const PREVIEW = 5;

  export function schedule(schedule: Schedule, zone: string | null = null, now: Date = new Date()) {
    return {
      id: schedule.id,
      title: schedule.title,
      description: schedule.description,
      kind: schedule.kind,
      location: schedule.location,
      capacity: schedule.capacity,
      seasonId: schedule.seasonId,
      startsAt: schedule.startsAt.toISOString(),
      minutes: schedule.minutes,
      listed: schedule.listed,
      freq: schedule.recur.freq,
      interval: schedule.recur.interval,
      count: schedule.recur.count,
      until: schedule.recur.until?.toISOString() ?? null,
      createdBy: schedule.createdBy,
      createdAt: schedule.createdAt.toISOString(),
      /**
       * The next few dates it would stamp, so a form can show what it is about to create. They are
       * walked forward from now rather than taken from the front of the rule: a Tuesday meeting in
       * its second term would otherwise show the Tuesdays of its first one, which have happened.
       */
      next: Expand.window(schedule, now, Wire.PREVIEW, zone).map((at) => at.toISOString()),
    };
  }

  /**
   * The club, in one shape whoever is asking. A signed-out visitor gets the name, the colour and
   * the logo, which is what the sign-in page renders, and nulls where the settings would be: one
   * shape rather than two keeps the browser's types simple and tells an anonymous caller nothing.
   */
  export function club(club: Club, settings = false) {
    return {
      name: club.name,
      tagline: club.tagline,
      logo: club.logo,
      listed: club.listed,
      /**
       * The whole look crosses to everybody, signed in or not. It has to: the sign-in page is the
       * club's page too, and a visitor who saw the default palette for a second before the club's
       * arrived would watch the site change colour under them.
       */
      design: {
        accent: club.design.accent,
        paper: club.design.paper,
        palette: club.design.palette,
        font: club.design.font,
        display: club.design.display,
        width: club.design.width,
        corner: club.design.corner,
        space: club.design.space,
        hue: club.design.hue,
        tint: club.design.tint,
        scale: club.design.scale,
        motion: club.design.motion,
        links: club.design.links,
        banner: club.design.banner,
        blurb: club.design.blurb,
        footer: club.design.footer,
      },
      /**
       * Sent to everybody, unlike the rest of the settings: the sign-in page is written in the
       * club's language too, and a visitor who has not signed in yet is exactly the reader most
       * in need of reading it in a language they have.
       */
      locale: club.locale,
      /** Who may sign in is an admin's business, and says nothing useful to anybody else. */
      organisations: settings ? club.organisations : null,
      domains: settings ? club.domains : null,
      allowed: settings ? club.allowed : null,
      blocked: settings ? club.blocked : null,
      providers: settings ? club.providers : null,
      admission: settings ? club.admission : null,
      /**
       * How an evening runs is sent to every member, not only to an admin: the compose form fills
       * its deadline from it, and a member reading an event wants to know when answers close.
       */
      deadline: club.deadline,
      remind: club.remind,
      guests: club.guests,
      waitlist: club.waitlist,
      timezone: settings ? club.timezone : null,
      updatedAt: settings ? club.updatedAt.toISOString() : null,
    };
  }

  export function prefs(prefs: Prefs) {
    return {
      telegram: prefs.telegram,
      email: prefs.email,
      announcements: prefs.announcements,
      reminders: prefs.reminders,
    };
  }

  /**
   * One entry of the trail, with the actor named.
   *
   * The name is passed in rather than looked up here: the route reads the roster once for the
   * whole page instead of this function reading it per row. Null is the scheduler, which acts on
   * nobody's behalf, and an id with no name left is somebody the club has since removed.
   */
  export function audit(entry: Audit, actor: Member | null) {
    return {
      id: entry.id,
      act: entry.act,
      actorId: entry.actorId,
      actor: actor?.name ?? null,
      subject: entry.subject,
      detail: entry.detail,
      at: entry.at.toISOString(),
    };
  }

  /** The whole answer to "who am I and what may I do", which is one request on page load. */
  /**
   * A job as an admin reads it.
   *
   * The payload goes out as it is stored, which across every kind is ids and nothing else, and an
   * admin looking at a failed announcement needs to know which event it was about. `error` is the
   * other half and is free text: it is whatever threw, rendered, which for a refused email carries
   * an excerpt of the provider's own answer. That is admin-only for the same reason the roster's
   * addresses are.
   */
  export function job(job: Job) {
    return {
      id: job.id,
      kind: job.kind,
      payload: job.payload,
      subject: job.subject,
      state: job.state,
      attempts: job.attempts,
      error: job.error,
      runAt: job.runAt.toISOString(),
      /** When a drainer took it, which is the only thing that says how long it has been stuck. */
      claimedAt: job.claimedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
    };
  }

  /**
   * Who is signed in, what they may do, and where they stand in the club's year.
   *
   * The season rides along with the viewer rather than being a page of its own to fetch, because
   * every page wants it: the shell writes the season's name where a member can always see it, and
   * "you have not renewed" is a sentence that has to reach somebody who never opens the seasons
   * page. Null is a club that does not run in years, and every one of those affordances disappears.
   */
  export function viewer(member: Member, ability: Ability, standing: Standing) {
    return {
      member: Wire.member(member),
      can: ability.actions,
      season: standing.season ? Wire.season(standing.season) : null,
      /** Whether they are on the open season's roster, and whether they may put themselves on it. */
      renewed: standing.renewed,
      renewable: standing.season?.renewable() ?? false,
    };
  }

  /** Where one member stands in the club's year. */
  export interface Standing {
    readonly season: Season | null;
    readonly renewed: boolean;
  }
}
