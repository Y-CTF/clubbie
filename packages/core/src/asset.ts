import { Bytes } from './bytes.ts';
import type { Id } from './id.ts';
import type { MemberId } from './member.ts';
import { Site } from './site.ts';

export type AssetId = Id<'asset'>;

/**
 * The image types a club may upload. A closed list, because it is also the list of `content-type`
 * values the app will ever echo back, and echoing an arbitrary one is how a "logo" becomes a
 * script somebody else's browser runs.
 *
 * SVG is deliberately absent: it is a document with scripts in it, and a club that wants a vector
 * logo can export a PNG at twice the size.
 */
export const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type Mime = (typeof MIMES)[number];

export interface AssetFields {
  readonly id: AssetId;
  readonly mime: Mime;
  readonly bytes: number;
  readonly uploadedBy: MemberId;
  readonly uploadedAt: Date;
}

/** The fields are declared once, in `AssetFields`; the class carries them by declaration merging. */
export interface Asset extends AssetFields {}

/**
 * An image a club uploaded: its logo, or the banner on its public page.
 *
 * It lives in the database with everything else, which is the whole point. A club with no sysadmin
 * backs up one file and restores one file, and a logo that lived on a disk beside it would be the
 * one thing missing after a restore. The size limit is what keeps that honest.
 */
export class Asset {
  static readonly MIMES = MIMES;
  /**
   * The largest image the app accepts. A logo is a few kilobytes and a banner is a few hundred;
   * anything past this is a photograph nobody resized, and it would be carried in every backup.
   */
  static readonly LIMIT = 512 * Bytes.KILO;
  /** Where an uploaded image is read back from, which is what a club's `logo` field then holds. */
  static readonly PATH = `${Site.API}/assets`;

  constructor(fields: AssetFields) {
    Object.assign(this, fields);
  }

  static is(mime: string): mime is Mime {
    return (MIMES as readonly string[]).includes(mime);
  }

  /** The url an uploaded image is reachable at, written in one place so nothing builds its own. */
  static url(id: AssetId): string {
    return `${Asset.PATH}/${id}`;
  }
}
