import { Markup } from '@clubbie/term';
import type { Message } from './message.ts';

/**
 * A notice as an email is laid out.
 *
 * Email is the one channel with room for a layout and the one with the worst renderer: a mail
 * client is an html parser from about 2005, so this is tables, inline styles and nothing else. No
 * stylesheet, no class, no flexbox, no web font. What it buys is a message that reads as a notice
 * from the club rather than as a wall of plain text with a fifty-character url at the bottom.
 *
 * The one colour is the club's own accent, the same one the site is drawn in, so a club that has
 * chosen its colour has chosen it here too. Every interpolated value is escaped: text through
 * `Markup.html`, which resolves the emphasis a notice is written in, and anything inside an
 * attribute through `Markup.attr`.
 *
 * The plain text alternative is the message's own `body`, stripped. Both halves go out together
 * because a client that will not render html still has to be readable, and a mail with no text
 * part is a mail that spam filters distrust.
 */
export namespace Letter {
  /** How wide the card is. 600px is what every mail client has agreed on for twenty years. */
  export const WIDTH = 600;
  export const INK = '#111827';
  export const MUTED = '#6b7280';
  export const LINE = '#e5e7eb';
  export const PAPER = '#f6f7f9';
  export const CARD = '#ffffff';
  /** A stack a mail client actually has, rather than one it substitutes silently. */
  export const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  export function html(message: Message): string {
    const accent = Markup.attr(message.from.accent);
    return [
      `<body style="margin:0;padding:0;background:${PAPER};">`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};padding:24px 12px;">`,
      '<tr><td align="center">',
      `<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;background:${CARD};border:1px solid ${LINE};border-radius:12px;overflow:hidden;font-family:${FONT};">`,
      `<tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>`,
      `<tr><td style="padding:28px 28px 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${Markup.html(message.from.name)}</td></tr>`,
      `<tr><td style="padding:8px 28px 0;font-size:22px;line-height:1.3;font-weight:600;color:${INK};">${Markup.html(message.title)}</td></tr>`,
      `<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.55;color:${INK};">${Markup.html(message.lead)}</td></tr>`,
      facts(message),
      note(message),
      action(message, accent),
      `<tr><td style="padding:24px 28px 28px;border-top:1px solid ${LINE};font-size:12px;line-height:1.5;color:${MUTED};">${Markup.html(message.from.why)}</td></tr>`,
      '</table>',
      '</td></tr></table>',
      '</body>',
    ]
      .filter(Boolean)
      .join('');
  }

  /** The facts as a two column table, so the values line up whatever length the labels are. */
  function facts(message: Message): string {
    if (message.facts.length === 0) return '';

    const rows = message.facts
      .map(
        (fact) =>
          `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:${MUTED};white-space:nowrap;vertical-align:top;">${Markup.html(fact.label)}</td>` +
          `<td style="padding:6px 0;font-size:15px;color:${INK};vertical-align:top;">${Markup.html(fact.value)}</td></tr>`,
      )
      .join('');

    return `<tr><td style="padding:20px 28px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>`;
  }

  /** The club's own words about the event, set apart so they read as a quotation and not as ours. */
  function note(message: Message): string {
    if (message.note === null) return '';
    return `<tr><td style="padding:20px 28px 0;"><div style="border-left:3px solid ${LINE};padding:2px 0 2px 12px;font-size:14px;line-height:1.55;color:${MUTED};white-space:pre-wrap;">${Markup.html(message.note)}</div></td></tr>`;
  }

  /**
   * The one thing to do, as a button and as a url underneath it. Both, because a client that
   * strips the styling leaves a link somebody can still press, and one that blocks the link
   * entirely leaves an address somebody can still copy.
   */
  function action(message: Message, accent: string): string {
    if (message.action === null) return '';

    const url = Markup.attr(message.action.url);
    const label = Markup.html(message.action.label);
    return (
      `<tr><td style="padding:24px 28px 0;">` +
      `<a href="${url}" style="display:inline-block;background:${accent};color:${CARD};text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:8px;">${label}</a>` +
      `</td></tr>` +
      `<tr><td style="padding:12px 28px 0;font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all;">${url}</td></tr>`
    );
  }

  /** The same notice for a client that will not render html. */
  export function text(message: Message): string {
    return Markup.strip(message.body);
  }
}
