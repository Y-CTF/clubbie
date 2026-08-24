import { type Action, Member } from '@clubbie/core';
import { api, Expiry, unwrap } from './api.ts';
import { Query } from './query.svelte.ts';

type Viewer = Awaited<ReturnType<typeof read>>;

async function read() {
  return unwrap(await api.me.$get());
}

/**
 * Who is signed in, and what they may do. The API answers both in one request, so the UI never
 * infers a permission from a role: it asks the same `Ability` the server enforces with, and a
 * button that would be refused is not rendered.
 */
export class Session {
  private readonly query = new Query<Viewer>(read);

  async load(): Promise<void> {
    await this.query.load();
  }

  get loading(): boolean {
    return this.query.first;
  }

  get viewer(): Viewer {
    return this.query.data ?? null;
  }

  get member() {
    return this.viewer?.member ?? null;
  }

  get signedIn(): boolean {
    return this.member !== null;
  }

  /**
   * The club's year, as the API answered it on this page load.
   *
   * It rides with the session rather than being fetched where it is shown, because the two places
   * that show it are the shell and a strip above every page: a season that had to be asked for
   * would be asked for on every navigation, and would be missing on the first paint of each.
   */
  get season() {
    return this.viewer?.season ?? null;
  }

  /** Whether the viewer is on the open season's roster. False when the club has no season. */
  get renewed(): boolean {
    return this.viewer?.renewed ?? false;
  }

  /** Whether renewing is still theirs to do, rather than an organiser's. */
  get renewable(): boolean {
    return this.viewer?.renewable ?? false;
  }

  /** Whether to ask them to renew: there is a season, they are not on it, and they still may. */
  get lapsed(): boolean {
    return this.season !== null && !this.renewed && this.renewable;
  }

  /** Renews into the open season and re-reads the session, which is what clears the strip. */
  async renew(): Promise<void> {
    const season = this.season;
    if (!season) return;

    await api.seasons[':id'].join.$post({ param: { id: season.id } });
    await this.load();
  }

  /** Signed in, and waiting for an organiser to admit them. They may still edit their profile. */
  get waiting(): boolean {
    return this.member?.status === Member.INITIAL;
  }

  can(action: Action): boolean {
    return this.viewer?.can.includes(action) ?? false;
  }

  async signOut(): Promise<void> {
    await api.auth.logout.$post();
    await this.load();
    location.assign('/');
  }
}

/** One session for the app, created here so every page reads the same state. */
export const session = new Session();

/**
 * Any refusal that says nobody is signed in re-reads the session, which answers `null` and sends
 * the app back to the sign-in page. Without it, a cookie that expired mid-visit leaves a member
 * looking at their own name in the nav over a page of refusals, with no way back.
 */
Expiry.onAnonymous = () => {
  void session.load();
};
