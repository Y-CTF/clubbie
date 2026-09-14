import {
  type Admission,
  Club,
  Design,
  type Font,
  type Language,
  Locale,
  type Palette,
  type Shortcut,
  type Width,
} from '@clubbie/core';
import type { Kysely, Selectable } from 'kysely';
import { Lock } from '../lock.ts';
import { Row } from '../row.ts';
import type { ClubTable, Schema } from '../schema.ts';

export interface Patch {
  readonly name?: string | undefined;
  readonly tagline?: string | null | undefined;
  readonly logo?: string | null | undefined;
  readonly listed?: boolean | undefined;
  readonly locale?: Language | null | undefined;
  readonly timezone?: string | null | undefined;
  readonly accent?: string | undefined;
  readonly paper?: string | null | undefined;
  readonly palette?: Palette | undefined;
  readonly font?: Font | undefined;
  readonly display?: Font | undefined;
  readonly width?: Width | undefined;
  readonly corner?: number | undefined;
  readonly space?: number | undefined;
  readonly hue?: number | undefined;
  readonly tint?: number | undefined;
  readonly scale?: number | undefined;
  readonly motion?: boolean | undefined;
  readonly links?: readonly Shortcut[] | undefined;
  readonly banner?: string | null | undefined;
  readonly blurb?: string | null | undefined;
  readonly footer?: string | null | undefined;
  readonly organisations?: readonly string[] | undefined;
  readonly domains?: readonly string[] | undefined;
  readonly allowed?: readonly string[] | undefined;
  readonly blocked?: readonly string[] | undefined;
  readonly providers?: readonly string[] | undefined;
  readonly embeds?: readonly string[] | undefined;
  readonly admission?: Admission | undefined;
  readonly deadline?: number | undefined;
  readonly remind?: number | undefined;
  readonly guests?: boolean | undefined;
  readonly waitlist?: boolean | undefined;
}

/**
 * The club's own identity and the look of its site: one row, read on every page load and written
 * by an admin now and then.
 *
 * `read` answers with the defaults when the row does not exist yet rather than making the caller
 * handle an empty club, so a fresh database serves a page instead of an error. Every design column
 * is nullable and every null means "not chosen": `Design` decides what that is worth, once, so a
 * column written by another release cannot render a page with `radius: banana` in it.
 */
export class Clubs {
  /** What separates one organisation from the next in the column. A domain never contains one. */
  static readonly SEP = ',';

  constructor(
    private readonly db: Kysely<Schema>,
    private readonly lock: Lock = Lock.NONE,
  ) {}

  static of(row: Selectable<ClubTable>): Club {
    return new Club({
      name: row.name,
      tagline: row.tagline,
      logo: row.logo,
      listed: Row.flag(row.listed),
      /** A column holds whatever an older release wrote; a language is one this release has. */
      locale: row.locale !== null && Locale.is(row.locale) ? row.locale : null,
      timezone: row.timezone,
      organisations: Clubs.list(row.organisations),
      domains: Clubs.list(row.domains),
      allowed: Clubs.list(row.allowed),
      blocked: Clubs.list(row.blocked),
      providers: Clubs.list(row.providers),
      embeds: Clubs.list(row.embeds),
      admission: Club.admission(row.admission ?? Club.ADMISSION),
      deadline: row.deadline ?? Club.DEADLINE,
      remind: row.remind ?? Club.REMIND,
      guests: row.guests === null ? Club.GUESTS : Row.flag(row.guests),
      waitlist: row.waitlist === null ? Club.WAITLIST : Row.flag(row.waitlist),
      design: new Design({
        accent: row.accent,
        paper: row.paper,
        palette: Design.palette(row.palette),
        font: Design.font(row.font),
        display: Design.font(row.display),
        width: Design.width(row.width),
        corner: Design.measure(Design.CORNER, row.corner),
        space: Design.measure(Design.SPACE, row.space),
        hue: Design.measure(Design.HUE, row.hue),
        tint: Design.measure(Design.TINT, row.tint),
        scale: Design.measure(Design.SCALE, row.scale),
        motion: row.motion === null ? Design.MOTION : Row.flag(row.motion),
        links: Design.links(row.links),
        banner: row.banner,
        blurb: row.blurb,
        footer: row.footer,
      }),
      updatedAt: Row.at(row.updatedAt),
      setup: row.setupAt !== null,
    });
  }

  /** A line of values as a list, with the blanks a hand-edited column collects dropped. */
  static list(line: string | null): string[] {
    if (!line) return [];
    return line
      .split(Clubs.SEP)
      .map((one) => one.trim().toLowerCase())
      .filter(Boolean);
  }

  /** A list as the column holds it, or the column's own value when the patch did not mention it. */
  private static line(given: readonly string[] | undefined, stored: string | null): string | null {
    return given === undefined ? stored : given.join(Clubs.SEP);
  }

  /** Stamps the club as set up, once, by whoever finished the wizard. */
  async establish(now: Date = new Date()): Promise<void> {
    await this.db
      .updateTable('club')
      .set({ setupAt: Row.ms(now) })
      .where('id', '=', Club.ROW)
      .where('setupAt', 'is', null)
      .execute();
  }

  async read(): Promise<Club> {
    const row = await this.db.selectFrom('club').selectAll().where('id', '=', Club.ROW).executeTakeFirst();
    return row ? Clubs.of(row) : Club.default();
  }

  /**
   * Upserts, because the first edit is what creates the row and nothing should have to seed it.
   *
   * A field the patch does not mention is written back exactly as the column held it, not as
   * `read` narrowed it. The difference matters for anything from a closed list: a row written by a
   * release that speaks Italian narrows to null here, and carrying that narrowing into the write
   * would turn "this release has no Italian" into "nobody has Italian any more" the next time
   * somebody renamed the club.
   *
   * The read and the write are one transaction, and on Postgres the row is held while they run.
   * They were two statements over every one of thirty-odd columns, so two admins saving different
   * sections at the same moment had the later save revert the earlier one, the door lists with it.
   */
  async update(patch: Patch, now: Date = new Date()): Promise<Club> {
    return this.db.transaction().execute(async (tx) => this.write(tx, patch, now));
  }

  private async write(tx: Kysely<Schema>, patch: Patch, now: Date): Promise<Club> {
    await this.lock.club(tx);

    const stored = await tx.selectFrom('club').selectAll().where('id', '=', Club.ROW).executeTakeFirst();
    const current = stored ? Clubs.of(stored) : Club.default();

    /** Untouched means untouched: the column's own value, whatever this release makes of it. */
    const kept = <K extends keyof ClubTable>(column: K, given: unknown): ClubTable[K] =>
      (given === undefined ? (stored?.[column] ?? null) : given) as ClubTable[K];

    const values = {
      id: Club.ROW,
      name: patch.name ?? current.name,
      tagline: patch.tagline === undefined ? current.tagline : patch.tagline,
      logo: patch.logo === undefined ? current.logo : patch.logo,
      listed: Row.bit(patch.listed ?? current.listed),
      locale: kept('locale', patch.locale),
      timezone: kept('timezone', patch.timezone),
      organisations: Clubs.line(patch.organisations, kept('organisations', undefined)),
      domains: Clubs.line(patch.domains, kept('domains', undefined)),
      allowed: Clubs.line(patch.allowed, kept('allowed', undefined)),
      blocked: Clubs.line(patch.blocked, kept('blocked', undefined)),
      providers: Clubs.line(patch.providers, kept('providers', undefined)),
      embeds: Clubs.line(patch.embeds, kept('embeds', undefined)),
      admission: kept('admission', patch.admission),
      deadline: kept('deadline', patch.deadline),
      remind: kept('remind', patch.remind),
      guests: patch.guests === undefined ? kept('guests', undefined) : Row.bit(patch.guests),
      waitlist: patch.waitlist === undefined ? kept('waitlist', undefined) : Row.bit(patch.waitlist),
      accent: patch.accent ?? current.design.accent,
      paper: patch.paper === undefined ? current.design.paper : patch.paper,
      palette: kept('palette', patch.palette),
      font: kept('font', patch.font),
      display: kept('display', patch.display),
      width: kept('width', patch.width),
      corner: kept('corner', patch.corner),
      space: kept('space', patch.space),
      hue: kept('hue', patch.hue),
      tint: kept('tint', patch.tint),
      scale: kept('scale', patch.scale),
      motion: patch.motion === undefined ? kept('motion', undefined) : Row.bit(patch.motion),
      links: patch.links === undefined ? kept('links', undefined) : JSON.stringify(patch.links),
      /** The old word columns are read by older releases and written by none: left as they are. */
      radius: kept('radius', undefined),
      density: kept('density', undefined),
      banner: patch.banner === undefined ? current.design.banner : patch.banner,
      blurb: patch.blurb === undefined ? current.design.blurb : patch.blurb,
      footer: patch.footer === undefined ? current.design.footer : patch.footer,
      updatedAt: Row.ms(now),
    };

    const row = await tx
      .insertInto('club')
      .values(values)
      .onConflict((c) => c.column('id').doUpdateSet(values))
      .returningAll()
      .executeTakeFirstOrThrow();
    return Clubs.of(row);
  }
}
