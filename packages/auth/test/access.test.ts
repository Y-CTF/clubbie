import { beforeEach, describe, expect, test } from 'bun:test';
import { Club } from '@clubbie/core';
import { Render } from '@clubbie/diag';
import { Logger } from '@clubbie/log';
import { type Profile, Store } from '@clubbie/store';
import { Auth } from '../src/auth.ts';
import type { Pending, Provider } from '../src/provider.ts';

const BASE = 'http://localhost:3000';

let store: Store;

/** A provider that hands back whatever identity a test wants, without going near a network. */
class Fake implements Provider {
  readonly name = 'eduid';

  constructor(private readonly profile: Profile) {}

  async begin(): Promise<Pending> {
    return { url: new URL(BASE), state: 'state', verifier: 'verifier' };
  }

  async finish(): Promise<Profile> {
    return this.profile;
  }
}

function auth(profile: Profile): Auth {
  const made = Auth.create(store, { baseUrl: BASE, providers: {} });
  /** The registry is built from configuration; a test puts its own provider in beside it. */
  (made as unknown as { providers: Map<string, Provider> }).providers.set(
    profile.provider,
    new Fake(profile),
  );
  return made;
}

/**
 * An identity from eduID, which names exactly one organisation and qualifies it with its own name,
 * the way the provider itself does.
 */
function identity(email: string, organisation: string | null): Profile {
  return {
    provider: 'eduid',
    subject: email,
    email,
    name: email,
    avatar: null,
    organisation,
    organisations: organisation ? [Club.organisation('eduid', organisation)] : [],
  };
}

/** An identity from GitHub, which belongs to as many organisations as it likes. */
function member(email: string, organisations: string[]): Profile {
  return {
    provider: 'github',
    subject: email,
    email,
    name: email,
    avatar: null,
    organisation: organisations[0] ?? null,
    organisations: organisations.map((one) => Club.organisation('github', one)),
  };
}

beforeEach(async () => {
  const { log } = Logger.memory();
  store = await Store.open(Store.MEMORY, log);
});

/**
 * Which institutions a club will have. A university society is exactly the deployment this app is
 * for, and "anybody in the Swiss academic federation" is not the same set as "our members".
 *
 * The check lives in `Auth.complete` rather than at the route because that is the one place a
 * sign-in becomes a member row: a second entry point that forgot it would create the row the club
 * said it did not want.
 */
/**
 * The rest of the door.
 *
 * `organisations` asks the identity provider which institution somebody belongs to, which only
 * eduID answers. The other four rules ask about the identity itself, so a club on GitHub can
 * still say who may join: by address domain, by name, and by which way in it accepts.
 */
describe('a club that filters who may join', () => {
  test('takes an address whose domain is on the list, whatever the provider said', async () => {
    await store.club.update({ domains: ['ethz.ch'] });

    const { member } = await auth(identity('ada@ethz.ch', null)).complete('eduid', 'code', 'verifier');
    expect(member.email).toBe('ada@ethz.ch');
  });

  test('turns away an address whose domain is not', async () => {
    await store.club.update({ domains: ['ethz.ch'] });

    expect(auth(identity('ada@evil.example', null)).complete('eduid', 'code', 'verifier')).rejects.toThrow();
  });

  test('lets a named address in even when it satisfies nothing else', async () => {
    await store.club.update({ organisations: ['eduid:ethz.ch'], allowed: ['coach@gmail.example'] });

    const { member } = await auth(identity('coach@gmail.example', null)).complete(
      'eduid',
      'code',
      'verifier',
    );
    expect(member.email).toBe('coach@gmail.example');
  });

  test('turns a blocked address away before anything else can admit it', async () => {
    await store.club.update({ allowed: ['ada@ethz.ch'], blocked: ['ada@ethz.ch'], domains: ['ethz.ch'] });

    expect(auth(identity('ada@ethz.ch', 'ethz.ch')).complete('eduid', 'code', 'verifier')).rejects.toThrow();
  });

  test('accepts only the ways in it named', async () => {
    await store.club.update({ providers: ['github'] });

    expect(auth(identity('ada@ethz.ch', 'ethz.ch')).complete('eduid', 'code', 'verifier')).rejects.toThrow();

    await store.club.update({ providers: [] });
    const { member } = await auth(identity('ada@ethz.ch', 'ethz.ch')).complete('eduid', 'code', 'verifier');
    expect(member.email).toBe('ada@ethz.ch');
  });
});

/**
 * What happens to somebody the door let through: they wait, or they are already a member. It is
 * one setting because a club that has already said who may sign in usually does not also want to
 * click each of them in by hand.
 */
describe('a club that admits automatically', () => {
  test('writes a first sign-in as active rather than pending', async () => {
    await store.club.update({ admission: 'open' });

    const { member } = await auth(identity('ada@ethz.ch', 'ethz.ch')).complete('eduid', 'code', 'verifier');
    expect(member.status).toBe('active');
  });

  test('leaves them waiting by default, which is what an untouched club does', async () => {
    const { member } = await auth(identity('ada@ethz.ch', 'ethz.ch')).complete('eduid', 'code', 'verifier');
    expect(member.status).toBe('pending');
  });
});

describe('a club that names its institutions', () => {
  test('lets an identity from one of them in', async () => {
    await store.club.update({ organisations: ['eduid:ethz.ch', 'eduid:unil.ch'] });

    const { member } = await auth(identity('ada@ethz.ch', 'ethz.ch')).complete('eduid', 'code', 'verifier');
    expect(member.email).toBe('ada@ethz.ch');
  });

  test('turns away one from anywhere else, and says where it is for', async () => {
    await store.club.update({ organisations: ['eduid:ethz.ch'] });

    const refused = auth(identity('alan@unil.ch', 'unil.ch')).complete('eduid', 'code', 'verifier');
    await expect(refused).rejects.toThrow();

    /** And creates nobody: a refusal that left a member row behind would be worse than useless. */
    expect(await store.members.count()).toBe(0);
  });

  /**
   * A provider that says nothing about an institution cannot satisfy a list of them. Waving it
   * through would make the setting a suggestion, and the club that set it would find out from a
   * stranger on its roster.
   */
  test('turns away a provider that does not say which institution it is', async () => {
    await store.club.update({ organisations: ['eduid:ethz.ch'] });

    const refused = auth(identity('ada@gmail.com', null)).complete('eduid', 'code', 'verifier');
    await expect(refused).rejects.toThrow();
  });

  test('the refusal names the institutions, so the member knows what happened', async () => {
    await store.club.update({ organisations: ['eduid:ethz.ch'] });

    try {
      await auth(identity('alan@unil.ch', 'unil.ch')).complete('eduid', 'code', 'verifier');
      throw new Error('it let them in');
    } catch (error) {
      const text = Render.plain(error as never);
      expect(text).toContain('ethz.ch');
      expect(text).toContain('unil.ch');
    }
  });
});

describe('a club that names none', () => {
  test('takes anybody, which is what a club that has not thought about it wants', async () => {
    const { member } = await auth(identity('ada@gmail.com', null)).complete('eduid', 'code', 'verifier');
    expect(member.email).toBe('ada@gmail.com');
  });
});

/**
 * An organisation is whatever the provider naming one calls it. eduID says `ethz.ch` and answers
 * with one; GitHub says `acme` and answers with as many as the account belongs to. A club names
 * one of them and the door has to mean the same thing either way.
 */
describe('a club whose members are an organisation', () => {
  test('lets in an identity that belongs to it among others', async () => {
    await store.club.update({ organisations: ['github:acme'] });

    const { member: joined } = await auth(member('ada@gmail.example', ['first', 'acme', 'third'])).complete(
      'github',
      'code',
      'verifier',
    );
    expect(joined.email).toBe('ada@gmail.example');
  });

  /** The bug this guards: asking only about the first would refuse a member for GitHub's ordering. */
  test('turns away an identity that belongs to none of them', async () => {
    await store.club.update({ organisations: ['github:acme'] });

    expect(
      auth(member('ada@gmail.example', ['first', 'second'])).complete('github', 'code', 'verifier'),
    ).rejects.toThrow();
  });

  test('turns away an identity whose provider named no organisation at all', async () => {
    await store.club.update({ organisations: ['github:acme'] });

    expect(auth(identity('ada@gmail.example', null)).complete('eduid', 'code', 'verifier')).rejects.toThrow();
  });

  /** The row keeps one of them, which is what a page shows beside a name. */
  test('stores the first as the member own organisation', async () => {
    const { member: joined } = await auth(member('ada@gmail.example', ['acme', 'other'])).complete(
      'github',
      'code',
      'verifier',
    );
    expect(joined.organisation).toBe('acme');
  });
});

/**
 * The hole the qualifier closes.
 *
 * A club that wrote down a university listed a name in eduID's namespace. Anybody may create an
 * organisation called almost anything at another provider, and a door that compared bare names
 * would have opened for one that happened to match. The provider is part of the entry for exactly
 * this reason, and the migration that qualified the existing lists is what keeps it true for a club
 * that wrote its door before there was a second provider to write it in.
 */
describe('an organisation at one provider is not one at another', () => {
  test('a github organisation named after a university does not open the university door', async () => {
    await store.club.update({ organisations: ['eduid:ethz.ch'] });

    const impostor = auth(member('mallory@gmail.example', ['ethz.ch'])).complete(
      'github',
      'code',
      'verifier',
    );
    await expect(impostor).rejects.toThrow();
    expect(await store.members.count()).toBe(0);
  });

  test('and the identity it was written for still gets in', async () => {
    await store.club.update({ organisations: ['eduid:ethz.ch'] });

    const { member: joined } = await auth(identity('ada@ethz.ch', 'ethz.ch')).complete(
      'eduid',
      'code',
      'verifier',
    );
    expect(joined.email).toBe('ada@ethz.ch');
  });
});
