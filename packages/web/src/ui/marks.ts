/**
 * What a sign-in provider is called when somebody is shown it, and how its logo is drawn.
 *
 * A provider's id is what the API knows it by (`eduid`, `github`); its name is how it writes
 * itself. Neither is translated: they are names, not prose. A provider with no entry here shows
 * its id and a generic mark, so a deployment that adds one to `Providers` gets a working button
 * before anybody writes it a line.
 *
 * The marks are data rather than a chain of branches in the component, because they are all the
 * same drawing with different paths in it: one viewBox, one or more filled shapes. They are drawn
 * here rather than fetched, because a sign-in page that waits on somebody else's CDN is a sign-in
 * page that is down when they are.
 */
export interface Piece {
  readonly d: string;
  /** A brand colour, or nothing to take the page's own ink. */
  readonly fill?: string;
}

export interface Mark {
  readonly viewBox: string;
  readonly pieces: readonly Piece[];
}

export namespace Marks {
  export const NAMES: Record<string, string> = {
    eduid: 'eduID',
    github: 'GitHub',
    google: 'Google',
    microsoft: 'Microsoft',
    gitlab: 'GitLab',
    discord: 'Discord',
    oidc: 'OpenID',
  };

  export const MARKS: Record<string, Mark> = {
    /** SWITCH edu-ID, from their design guidelines: a white disc, `eD` in their blue. */
    eduid: {
      viewBox: '0 0 192 195.58',
      pieces: [
        { d: 'M96,192C42.98,192,0,149.02,0,96S42.98,0,96,0s96,42.98,96,96-42.98,96-96,96', fill: '#fff' },
        { d: 'M33.04,39.12h23.24v113.77h-23.24V39.12Z', fill: '#33749e' },
        {
          d: 'M81.57,39.12h37.49c32.69,0,58.49,25.16,58.49,56.89s-25.8,56.88-58.49,56.88h-37.49V39.12ZM119.06,131.57c21,0,35.09-15.86,35.09-35.57s-14.1-35.58-35.09-35.58h-14.26v71.15h14.26Z',
          fill: '#33749e',
        },
        { d: 'M176.99,195.58c-4.42,0-8-3.58-8-8s3.58-8,8-8,8,3.58,8,8-3.58,8-8,8', fill: '#fff' },
      ],
    },
    github: {
      viewBox: '0 0 16 16',
      pieces: [
        {
          d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z',
        },
      ],
    },
    /** Google's monochrome G, which is the mark they publish for a one-colour surface. */
    google: {
      viewBox: '0 0 24 24',
      pieces: [
        {
          d: 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
        },
      ],
    },
    /** Microsoft's four squares, which is the whole mark: no letterform, no outline. */
    microsoft: {
      viewBox: '0 0 24 24',
      pieces: [
        { d: 'M1 1h10.2v10.2H1z', fill: '#f25022' },
        { d: 'M12.8 1H23v10.2H12.8z', fill: '#7fba00' },
        { d: 'M1 12.8h10.2V23H1z', fill: '#00a4ef' },
        { d: 'M12.8 12.8H23V23H12.8z', fill: '#ffb900' },
      ],
    },
    gitlab: {
      viewBox: '0 0 24 24',
      pieces: [
        {
          d: 'm23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z',
          fill: '#fc6d26',
        },
      ],
    },
    discord: {
      viewBox: '0 0 24 24',
      pieces: [
        {
          d: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z',
          fill: '#5865f2',
        },
      ],
    },
    /** The OpenID mark, for the entry that is whichever provider a deployment configured. */
    oidc: {
      viewBox: '0 0 24 24',
      pieces: [
        {
          d: 'M14.54.889l-3.63 1.773v18.17c-4.15-.52-7.27-2.78-7.27-5.5 0-2.58 2.8-4.75 6.63-5.41v-2.31C4.42 8.322 0 11.502 0 15.332c0 3.96 4.74 7.24 10.91 7.78l3.63-1.71V.888m.64 6.724v2.31c1.43.25 2.71.7 3.76 1.31l-1.97 1.11 7.03 1.53-.5-5.21-1.87 1.06c-1.74-1.06-3.96-1.81-6.45-2.11z',
          fill: '#f78c40',
        },
      ],
    },
  };

  export function label(provider: string): string {
    return NAMES[provider] ?? provider;
  }

  export function mark(provider: string): Mark | null {
    return MARKS[provider] ?? null;
  }
}
