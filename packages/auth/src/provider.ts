import type { Profile } from '@clubbie/store';

/** What a caller must hand back to finish a flow it started. */
export interface Pending {
  readonly url: URL;
  readonly state: string;
  readonly verifier: string;
}

/**
 * One OAuth provider, reduced to the two things the app needs: where to send someone, and who
 * came back. Arctic owns the protocol; a provider here owns the profile, because only it knows
 * which field is a stable subject and which email has actually been verified.
 */
export interface Provider {
  readonly name: string;
  begin(state: string, verifier: string): Pending | Promise<Pending>;
  finish(code: string, verifier: string): Promise<Profile>;
}

/** A provider is configured or it does not exist. An unconfigured one must never half-work. */
export interface Credentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly issuer?: string | undefined;
}

export namespace Provider {
  export function configured(credentials: Partial<Credentials>): credentials is Credentials {
    return Boolean(credentials.clientId && credentials.clientSecret);
  }
}
