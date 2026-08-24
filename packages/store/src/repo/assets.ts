import { Asset, type AssetId, Id, type MemberId, type Mime } from '@clubbie/core';
import type { Kysely, Selectable } from 'kysely';
import { Row } from '../row.ts';
import type { AssetTable, Schema } from '../schema.ts';

/** An image and its bytes, which is the only shape a caller ever has to serve one. */
export interface Stored {
  readonly asset: Asset;
  readonly body: Uint8Array;
}

/**
 * The images a club uploaded. They are in the database with everything else, so one file is still
 * one backup, and they are base64 text so that one file can be either dialect.
 *
 * Encoding and decoding happen here and nowhere else: above this, an image is bytes.
 */
export class Assets {
  constructor(private readonly db: Kysely<Schema>) {}

  static of(row: Selectable<AssetTable>): Asset {
    return new Asset({
      id: row.id,
      mime: row.mime as Mime,
      bytes: row.bytes,
      uploadedBy: row.uploadedBy,
      uploadedAt: Row.at(row.uploadedAt),
    });
  }

  async add(body: Uint8Array, mime: Mime, by: MemberId, now: Date = new Date()): Promise<Asset> {
    const row = await this.db
      .insertInto('asset')
      .values({
        id: Id.create<'asset'>(),
        mime,
        body: Assets.encode(body),
        bytes: body.byteLength,
        uploadedBy: by,
        uploadedAt: Row.ms(now),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return Assets.of(row);
  }

  async read(id: AssetId): Promise<Stored | null> {
    const row = await this.db.selectFrom('asset').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? { asset: Assets.of(row), body: Assets.decode(row.body) } : null;
  }

  /** What an admin sees on the design page: what has been uploaded, newest first, without bytes. */
  async list(): Promise<Asset[]> {
    const rows = await this.db
      .selectFrom('asset')
      .select(['id', 'mime', 'bytes', 'uploadedBy', 'uploadedAt'])
      .orderBy('uploadedAt', 'desc')
      .execute();
    return rows.map((row) => Assets.of({ ...row, body: '' }));
  }

  async remove(id: AssetId): Promise<boolean> {
    const gone = await this.db.deleteFrom('asset').where('id', '=', id).returning('id').execute();
    return gone.length > 0;
  }

  /** `btoa` takes a binary string, so the bytes are widened one at a time rather than decoded. */
  private static encode(body: Uint8Array): string {
    let binary = '';
    for (const byte of body) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  private static decode(text: string): Uint8Array {
    const binary = atob(text);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
}
