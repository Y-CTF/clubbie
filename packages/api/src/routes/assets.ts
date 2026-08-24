import { Asset, Bytes, Cache } from '@clubbie/core';
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
 * The images a club uploads: its logo, and the banner on its public page.
 *
 * Uploading is an admin act; reading is public, because the logo is on the sign-in page and a
 * calendar client or a link preview has no cookie either. The bytes go in the database with
 * everything else, so one file is still one backup.
 *
 * Three things keep this from being a file server somebody could use as one. It is admin-only to
 * write, the size is capped at `Asset.LIMIT`, and the type is a closed list that is also what the
 * answer's `content-type` is set to: a caller cannot get the app to echo back a type of their
 * choosing, which is how an "image" becomes a script in somebody else's browser.
 */
export const assets = new Hono<Env>()
  .get('/:id', vValidator('param', Input.params.asset, Check.param), async (c) => {
    const found = await c.get('store').assets.read(c.req.valid('param').id);
    if (!found) throw Fail.missing('image');

    return c.body(found.body as unknown as ArrayBuffer, 200, {
      'content-type': found.asset.mime,
      'content-length': String(found.asset.bytes),
      /** The id is random and the bytes never change under it, so it can be kept for good. */
      'cache-control': Cache.IMMUTABLE,
      /** It is an image, whatever anybody says: never sniffed, never rendered as a document. */
      ...Cache.SNIFF,
      'content-disposition': 'inline',
    });
  })

  .get('/', Guard.needs('club:manage'), async (c) => {
    const stored = await c.get('store').assets.list();
    return c.json(
      stored.map((asset) => ({
        id: asset.id,
        url: Asset.url(asset.id),
        mime: asset.mime,
        bytes: asset.bytes,
        uploadedAt: asset.uploadedAt.toISOString(),
      })),
    );
  })

  /**
   * The body is the image itself rather than a multipart form: there is one file, the type is in
   * the header where it belongs, and nothing here has to parse a boundary.
   */
  .post('/', Guard.needs('club:manage'), async (c) => {
    const mime = (c.req.header('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!Asset.is(mime)) {
      throw Fail.invalid(
        Diag.error(Codes.asset.type, markup`\`${mime || 'nothing'}\` is not an image this app takes`)
          .note(markup`it takes ${Asset.MIMES.join(', ')}`)
          .help('export it as a png and try again'),
      );
    }

    const body = new Uint8Array(await c.req.arrayBuffer());
    if (body.byteLength === 0) throw Fail.invalid(Diag.error(Codes.asset.empty, 'that image is empty'));

    if (body.byteLength > Asset.LIMIT) {
      throw Fail.invalid(
        Diag.error(Codes.asset.size, 'that image is too big to keep in the database')
          .note(markup`it is ${kilobytes(body.byteLength)}, and the limit is ${kilobytes(Asset.LIMIT)}`)
          .help('scale it down: a logo is rarely more than a few hundred pixels across'),
      );
    }

    const stored = await c.get('store').assets.add(body, mime, Guard.member(c).id);
    await Trail.record(c, 'asset.add', stored.id, { mime, bytes: stored.bytes });

    return c.json({ id: stored.id, url: Asset.url(stored.id), mime, bytes: stored.bytes }, 201);
  })

  .delete(
    '/:id',
    Guard.needs('club:manage'),
    vValidator('param', Input.params.asset, Check.param),
    async (c) => {
      const { id } = c.req.valid('param');
      if (!(await c.get('store').assets.remove(id))) throw Fail.missing('image');

      await Trail.record(c, 'asset.remove', id, {});
      return c.json({ ok: true });
    },
  );

function kilobytes(bytes: number): string {
  return `${Math.round(bytes / Bytes.KILO)} kB`;
}
