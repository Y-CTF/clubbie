import { describe, expect, test } from 'bun:test';
import { Site } from '../src/index.ts';

const BASE = 'https://clubbie.example.org';

describe('Site', () => {
  test('a path with no parameters is the pattern itself', () => {
    expect(Site.path('events')).toBe('/events');
    expect(Site.path('home')).toBe('/');
  });

  test('a parameter is filled in where it sits', () => {
    expect(Site.path('event', { id: 'ABC' })).toBe('/events/ABC');
    expect(Site.path('sheet', { id: 'ABC' })).toBe('/events/ABC/sheet');
  });

  /** A missing parameter must not produce a path with `:id` in it, which would 404 silently. */
  test('a parameter nobody passed leaves an empty segment rather than its own name', () => {
    expect(Site.path('event')).not.toContain(':');
  });

  test('an absolute url is what a message outside the browser carries', () => {
    expect(Site.url(BASE, 'event', { id: 'ABC' })).toBe(`${BASE}/events/ABC`);
  });

  test('every path starts at the root, so a link is never relative by accident', () => {
    for (const pattern of Object.values(Site.PATHS)) expect(pattern.startsWith('/')).toBe(true);
  });

  /** The fixed path has to win, or `/events/new` would be read as an event whose id is `new`. */
  test('the compose path is more specific than the event path', () => {
    expect(Site.PATHS.compose.includes(':')).toBe(false);
    expect(Site.PATHS.event.includes(':')).toBe(true);
    expect(Site.PATHS.compose.split('/').length).toBe(Site.PATHS.event.split('/').length);
  });
});
