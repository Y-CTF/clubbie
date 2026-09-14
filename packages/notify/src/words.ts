import { type Language, Locale } from '@clubbie/core';
import { markup } from '@clubbie/term';

/**
 * The phrases every notice is built from, in each language the app is written in.
 *
 * They are fragments rather than whole messages because the shape of a notice belongs to
 * `Notices` and only the words belong here: which facts an announcement carries, and that a fact
 * an event has nothing for is dropped, is one decision taken once. A translator writes phrases and
 * cannot accidentally leave the location out of the German version.
 *
 * Every fragment is a `markup` template, like everything else a member is sent, so an event title
 * somebody typed cannot open a span or forge a line of an email whichever language it goes out in.
 *
 * This is the second catalogue in the codebase; the other is the SPA's, in `web/src/lib/words`.
 * They are apart because they share no strings: one is buttons and labels, the other is sentences
 * the club sends. Adding a language means writing both, and the `Language` union is what says so.
 */
/**
 * A notice about one evening and one member's place at it. The three that carry it say the same
 * things in the same order and differ only in the words, so the shape is named once and a
 * translator who adds a language is told exactly what is missing.
 */
export interface Seat {
  readonly subject: (club: string, title: string) => string;
  readonly lead: () => string;
  readonly action: string;
}

export interface Phrases {
  /** Why a member is reading this at all, at the foot of anything with room for a foot. */
  readonly footer: (club: string) => string;
  /**
   * What a fact is called. They are shared across notices rather than written per notice, because
   * "when" means the same thing in a reminder as it does in an announcement, and a club that read
   * two different words for it would think they were two different things.
   */
  readonly labels: {
    readonly when: string;
    readonly kind: string;
    readonly where: string;
    readonly places: string;
    readonly closes: string;
    /** A deadline that is not an event's: the day a season stops taking renewals. */
    readonly until: string;
  };
  readonly published: {
    readonly subject: (club: string, title: string) => string;
    readonly lead: (club: string) => string;
    readonly action: string;
  };
  readonly reminder: Seat;
  readonly promoted: Seat;
  readonly demoted: Seat;
  readonly admitted: {
    readonly subject: (club: string) => string;
    readonly lead: (name: string, club: string) => string;
    readonly action: string;
  };
  /**
   * The one notice about a member's own standing rather than about an evening. It says what has
   * opened, by when, and where to do it in one press, because a member who reads it on a phone in
   * a queue is not going to go looking for a page afterwards.
   */
  readonly renewal: {
    readonly subject: (club: string, season: string) => string;
    readonly lead: (season: string) => string;
    readonly action: string;
  };
  /**
   * The one mail sent to somebody who is not a member yet, so its foot cannot say they are one.
   */
  readonly signin: {
    readonly subject: (club: string) => string;
    readonly lead: (club: string) => string;
    readonly code: string;
    readonly action: string;
    readonly why: (club: string) => string;
    readonly ignore: string;
  };
}

const en: Phrases = {
  footer: (club) => markup`you are getting this because you are a member of ${club}.`,
  labels: {
    when: 'when',
    kind: 'what',
    where: 'where',
    places: 'places',
    closes: 'answers close',
    until: 'open until',
  },
  published: {
    subject: (club, title) => markup`${club}: ${title}`,
    lead: (club) => markup`${club} has put a new event on the calendar.`,
    action: 'answer',
  },
  reminder: {
    subject: (club, title) => markup`${club}: ${title} is tomorrow`,
    lead: () => markup`you said you were coming, so this is the reminder.`,
    action: 'see the event',
  },
  promoted: {
    subject: (club, title) => markup`${club}: you have a place at ${title}`,
    lead: () =>
      markup`a place freed up and it is yours. if you cannot make it, withdraw so the next person gets it.`,
    action: 'see the event',
  },
  demoted: {
    subject: (club, title) => markup`${club}: your place at ${title} has gone`,
    lead: () =>
      markup`this event has fewer places than it did, and yours was one of the newest. you are on the waiting list now, and take the next place that frees up.`,
    action: 'see the event',
  },
  admitted: {
    subject: (club) => markup`${club}: you are in`,
    lead: (name, club) => markup`${name}, you are now an active member of ${club}.`,
    action: 'open the club',
  },
  renewal: {
    subject: (club, season) => markup`${club}: renew for ${season}`,
    lead: (season) =>
      markup`${season} has started, and you are not on its roster yet. after the deadline an organiser has to do it for you.`,
    action: 'renew',
  },
  signin: {
    subject: (club) => markup`${club}: your sign-in link`,
    lead: (club) => markup`press the button to sign in to ${club}. the link works once, for fifteen minutes.`,
    code: 'or type this code',
    action: 'sign in',
    why: (club) =>
      markup`you are getting this because somebody asked to sign in to ${club} with this address.`,
    ignore: 'if that was not you, nothing has happened and you can ignore this.',
  },
};

const de: Phrases = {
  footer: (club) => markup`du bekommst das, weil du Mitglied von ${club} bist.`,
  labels: {
    when: 'wann',
    kind: 'was',
    where: 'wo',
    places: 'Plätze',
    closes: 'Anmeldung bis',
    until: 'offen bis',
  },
  published: {
    subject: (club, title) => markup`${club}: ${title}`,
    lead: (club) => markup`${club} hat einen neuen Termin im Kalender.`,
    action: 'antworten',
  },
  reminder: {
    subject: (club, title) => markup`${club}: ${title} ist morgen`,
    lead: () => markup`du hast zugesagt, darum diese Erinnerung.`,
    action: 'zum Termin',
  },
  promoted: {
    subject: (club, title) => markup`${club}: du hast einen Platz bei ${title}`,
    lead: () =>
      markup`ein Platz ist frei geworden, und er gehört dir. wenn du nicht kannst, melde dich ab, damit der Nächste ihn bekommt.`,
    action: 'zum Termin',
  },
  demoted: {
    subject: (club, title) => markup`${club}: dein Platz bei ${title} ist weg`,
    lead: () =>
      markup`dieser Termin hat weniger Plätze als vorher, und deiner war einer der neuesten. du stehst jetzt auf der Warteliste und bekommst den nächsten freien Platz.`,
    action: 'zum Termin',
  },
  admitted: {
    subject: (club) => markup`${club}: du bist dabei`,
    lead: (name, club) => markup`${name}, du bist jetzt aktives Mitglied von ${club}.`,
    action: 'zum Verein',
  },
  renewal: {
    subject: (club, season) => markup`${club}: Verlängerung für ${season}`,
    lead: (season) =>
      markup`${season} hat begonnen, und du stehst noch nicht auf der Liste. nach dem Stichtag muss es jemand vom Vorstand für dich tun.`,
    action: 'verlängern',
  },
  signin: {
    subject: (club) => markup`${club}: dein Anmeldelink`,
    lead: (club) =>
      markup`druck auf den Knopf, um dich bei ${club} anzumelden. der Link gilt einmal, fur funfzehn Minuten.`,
    code: 'oder gib diesen Code ein',
    action: 'anmelden',
    why: (club) => markup`du bekommst das, weil jemand sich mit dieser Adresse bei ${club} anmelden wollte.`,
    ignore: 'warst du das nicht, ist nichts passiert und du kannst das ignorieren.',
  },
};

const fr: Phrases = {
  footer: (club) => markup`vous recevez ceci parce que vous êtes membre de ${club}.`,
  labels: {
    when: 'quand',
    kind: 'quoi',
    where: 'où',
    places: 'places',
    closes: "réponses jusqu'au",
    until: "ouvert jusqu'au",
  },
  published: {
    subject: (club, title) => markup`${club} : ${title}`,
    lead: (club) => markup`${club} a ajouté un événement au calendrier.`,
    action: 'répondre',
  },
  reminder: {
    subject: (club, title) => markup`${club} : ${title}, c'est demain`,
    lead: () => markup`vous avez dit que vous veniez, voici le rappel.`,
    action: "voir l'événement",
  },
  promoted: {
    subject: (club, title) => markup`${club} : vous avez une place à ${title}`,
    lead: () =>
      markup`une place s'est libérée, elle est pour vous. si vous ne pouvez pas venir, retirez-vous pour laisser la place au suivant.`,
    action: "voir l'événement",
  },
  demoted: {
    subject: (club, title) => markup`${club} : votre place à ${title} a sauté`,
    lead: () =>
      markup`cet événement a moins de places qu'avant, et la vôtre était des plus récentes. vous êtes sur la liste d'attente et prenez la prochaine place libérée.`,
    action: "voir l'événement",
  },
  admitted: {
    subject: (club) => markup`${club} : vous êtes admis`,
    lead: (name, club) => markup`${name}, vous êtes désormais membre actif de ${club}.`,
    action: 'ouvrir le club',
  },
  renewal: {
    subject: (club, season) => markup`${club} : renouvellement pour ${season}`,
    lead: (season) =>
      markup`${season} a commencé, et vous n'êtes pas encore sur la liste. après la date limite, il faudra passer par le comité.`,
    action: 'renouveler',
  },
  signin: {
    subject: (club) => markup`${club} : ton lien de connexion`,
    lead: (club) =>
      markup`appuie sur le bouton pour te connecter a ${club}. le lien fonctionne une fois, pendant quinze minutes.`,
    code: 'ou saisis ce code',
    action: 'se connecter',
    why: (club) =>
      markup`tu recois ceci parce que quelqu'un a demande a se connecter a ${club} avec cette adresse.`,
    ignore: "si ce n'etait pas toi, rien ne s'est passe et tu peux ignorer ce message.",
  },
};

export namespace Phrases {
  export const CATALOGUES: Readonly<Record<Language, Phrases>> = { en, de, fr };

  /** The phrases for a club's language. A club that has chosen none is written to in English. */
  export function of(locale: Language | null): Phrases {
    return CATALOGUES[Locale.pick(locale)];
  }
}
