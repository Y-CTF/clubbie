import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { Check } from '../check.ts';
import type { Env } from '../context.ts';
import { Guard } from '../guard.ts';
import { Input } from '../input.ts';
import { Wire } from '../wire.ts';

/**
 * The audit trail, read-only and admin-only. It answers the question a club asks three months
 * later ("who admitted them?", "who deleted that?"), and it is filtered by subject so the trail
 * for one event or one member is one request.
 */
export const trail = new Hono<Env>().get(
  '/',
  Guard.needs('audit:read'),
  vValidator('query', Input.auditQuery, Check.query),
  async (c) => {
    const store = c.get('store');
    const which = c.req.valid('query');
    const [entries, total] = await Promise.all([store.audit.list(which), store.audit.count(which)]);

    /**
     * The roster once, rather than a lookup per row. A trail of a hundred entries is usually a
     * handful of people, and "who" is the question the whole screen exists to answer.
     */
    const roster = new Map((await store.members.list()).map((member) => [member.id, member]));
    return c.json({
      entries: entries.map((entry) =>
        Wire.audit(entry, entry.actorId ? (roster.get(entry.actorId) ?? null) : null),
      ),
      total,
    });
  },
);
