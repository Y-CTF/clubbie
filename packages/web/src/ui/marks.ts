/**
 * What a sign-in provider is called when somebody is shown it.
 *
 * A provider's id is what the API knows it by (`eduid`, `github`); its name is how it writes
 * itself. Neither is translated: they are names, not prose. A provider with no entry here shows
 * its id, so a deployment that adds one to `Providers` gets a working button before anybody
 * writes it a line.
 */
export namespace Marks {
  export const NAMES: Record<string, string> = {
    eduid: 'eduID',
    github: 'GitHub',
  };

  export function label(provider: string): string {
    return NAMES[provider] ?? provider;
  }
}
