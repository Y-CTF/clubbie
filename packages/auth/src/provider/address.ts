import { Club, Signin } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Profile, Requested, Store } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { Codes } from '../codes.ts';

/**
 * Signing in with an address and nothing else.
 *
 * Not a `Provider`: there is nowhere to redirect to and nothing to exchange, because the app is
 * proving the address itself rather than asking somebody else to. Everything after the proof is
 * shared, which is `Auth.admit`.
 *
 * The address is lowercased throughout: it is the subject a member is matched on, and two cases
 * of one address would be one person with two accounts.
 */
export class Address {
  readonly name = Signin.PROVIDER;

  constructor(private readonly store: Store) {}

  /**
   * The same door `Auth.admit` decides on, asked early: a club that takes one university has no
   * business sending a mail to an address it will refuse fifteen minutes later.
   */
  async open(given: string, now: Date = new Date()): Promise<Requested> {
    const email = Address.normalise(given);
    const club = await this.store.club.read();

    if (club.refuses(Address.profile(email)) !== null) {
      throw Diag.error(Codes.organisation, markup`${email} may not sign in here`)
        .note(Address.why(club))
        .help('use an address this club admits, or ask an organiser to add yours');
    }

    return this.store.signins.open(email, now);
  }

  /** The identity a spent link proves. */
  async claim(token: string, now: Date = new Date()): Promise<Profile> {
    const email = await this.store.signins.claim(token, now);
    if (email) return Address.profile(email);

    throw Diag.error(Codes.expired, 'this sign-in link is no longer valid')
      .note('a link is good once, and for fifteen minutes')
      .help('ask for a new one from the sign-in page');
  }

  /** The identity a code proves, saying which of the three ways it failed when it did. */
  async answer(given: string, typed: string, now: Date = new Date()): Promise<Profile> {
    const email = Address.normalise(given);
    const outcome = await this.store.signins.answer(email, Signin.typed(typed), now);

    switch (outcome) {
      case 'unknown':
        throw Diag.error(Codes.expired, 'that code is not the one we sent')
          .note(markup`check the mail sent to ${email}, or ask for another`)
          .help('a code is six digits, and three wrong answers spend it');
      case 'expired':
        throw Diag.error(Codes.expired, 'that code has run out')
          .note('a code is good for fifteen minutes')
          .help('ask for a new one from the sign-in page');
      case 'exhausted':
        throw Diag.error(Codes.expired, 'that code has been answered wrongly too often')
          .note('it is spent, so nobody can go on guessing at it')
          .help('ask for a new one from the sign-in page');
      default:
        return Address.profile(outcome);
    }
  }

  /** Why, without naming the list: that an address is specifically blocked is the club's business. */
  private static why(club: Club): string {
    const doors = [...club.organisations.map(Club.named), ...club.domains];
    return doors.length > 0
      ? markup`this club takes members of ${doors.join(', ')}`
      : 'this club does not admit that address';
  }

  /** The subject is the address, because the address is what was proved. */
  private static profile(email: string): Profile {
    return { provider: Signin.PROVIDER, subject: email, email, name: email, avatar: null };
  }

  private static normalise(email: string): string {
    return email.trim().toLowerCase();
  }
}
