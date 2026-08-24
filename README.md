<h1 align="center">clubbie</h1>

<p align="center">
  Event and member management for a small club, in one binary and one database file.
</p>

Written for associations that run on volunteers: a student CTF club, a choir, a hiking
group. Members sign in with an identity they already have, answer events, and get counted;
organisers admit members, publish events, take attendance, and are told who turned up. Nothing
else.

## Running it

```sh
cp .env.example .env          # set SESSION_SECRET at least
bun install
bun run dev                   # api on :3000, spa on :5173
```

The first person to sign in becomes the admin. Everyone after them arrives as `pending`
and waits to be admitted.

For a real deployment, one binary serves the API, the built SPA and the scheduler on one origin:

```sh
bun run build                 # dist/clubbie, plus packages/web/dist
DATABASE_URL=sqlite:clubbie.db ./dist/clubbie serve
```

```
clubbie - club manager for small associations

usage: clubbie <command>

serve          run the api, the web app and the scheduler (default)
migrate        apply pending schema migrations, then exit
seed           fill an empty database with development data
admin <email>  make an existing member an admin
backup <path>  copy the database to a file, safely, while it runs
work           run one pass of the job queue, then exit
```

## Configuration

Everything is environment variables, and a bad one is refused at boot with a diagnostic
pointing at it:

```
error[config.port]: a port is a whole number between 1 and 65535
  ,-[environment:4:1]
4 | PORT=99999
  : ^^^^^^^^^^ a port is a whole number between 1 and 65535
  `-
  help: remove `PORT` to use 3000
```

| Variable | Default | What it is |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:clubbie.db` | `sqlite:<path>` or `postgres://…` |
| `BASE_URL` | `http://localhost:3000` | the origin members reach; OAuth redirects and every link in a reminder are built from it |
| `SESSION_SECRET` | none, required | 32+ characters, `openssl rand -base64 32`. Signs the in-flight sign-in cookie and every calendar url |
| `PORT` | `3000` | |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error` |
| `LOG_JSON` | unset | one JSON object per line, for a collector |
| `ASSETS` | `packages/web/dist` | the built SPA the server puts in front of the API |
| `TRUST_PROXY` | unset | set only when something in front rewrites `x-forwarded-for`; the throttle believes it then |
| `TELEGRAM_TOKEN` | unset | starts the bot when set |
| `EMAIL_API_KEY` / `EMAIL_FROM` | unset | both or neither: sends notices by email |
| `EMAIL_ENDPOINT` | Resend's | any API that takes the same JSON |
| `EDUID_CLIENT_ID` / `EDUID_CLIENT_SECRET` | unset | Swiss academic identity, via OIDC |
| `EDUID_ISSUER` | `https://login.eduid.ch` | the OIDC issuer discovery starts from |
| `TZ` | the host's | read by the runtime, not by the config: the wall clock a repeating event keeps when the club has set no timezone. Not validated at boot, and an empty value means UTC |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | unset | |

A provider with only half its credentials set is refused at boot rather than at the
redirect, the email channel likewise, and a deployment with no provider configured says so on the
sign-in page.

## What is in the box

- **Members** with a role (`admin`, `member`) and a status (`pending`, `active`,
  `alumni`). Signing in with a second provider that carries the same verified email joins
  the same member rather than creating a second one. An admin can filter the roster, promote,
  retire, and read one member's attendance history.
- **Events** with a kind the club invented, a state (`draft`, `published`, `cancelled`), an
  optional capacity and an optional answer deadline. What an event *is* is a list a committee
  edits: a choir has rehearsals and concerts, a CTF team has workshops and competitions, and
  neither has to file an evening under "other". Renaming one leaves every event that is one
  alone, and a kind that events are cannot be deleted. A draft is visible to its organiser only. The whole
  editor is in the web app, including publishing and deleting.
- **Answers and attendance**, kept apart: what somebody said, and what they did. A full event
  takes a `waitlist` answer, and the next withdrawal promotes whoever waited longest, in one
  transaction, and tells them.
- **Guests**: somebody at an event without an account. They take a place like anybody else, so a
  capacity means what it says on the door.
- **A calendar**, which is what the events page is: a month, a week, a day and a list, over the
  same window. Anything crossing a midnight is one bar across the days it covers, anything
  overlapping is drawn side by side, and a kind gets its own colour without anybody picking one.
  A member answers an event from the grid without leaving the month they were reading; an organiser
  clicks an empty hour and the form opens on it. The view and the day are in the address, so a week
  can be sent to somebody, and the keyboard moves it: `m` `w` `d` `a`, `t` for today, `j` and `k`.
- **Repeating events**, written on the same form as any other event: a repeat is not a second kind
  of thing a club does, it is one of them happening again, so it is one more answer on the form
  rather than a page of its own. A schedule is a rule and a template, and its occurrences are
  ordinary events, so next Tuesday can be cancelled or moved without touching the rest of the term.
  The rule steps in wall-clock time in the club's own zone, so a 19:00 meeting is at 19:00 in
  December too. Editing one says what it costs: a changed room carries onto the nights still to
  come and keeps every answer, a changed rule drops those nights and stamps fresh ones.
- **Seasons**: academic periods with their own roster and a renewal deadline members can
  join themselves before, plus a one-click roll-over of last season's active members.
- **Announcements and reminders**: publishing an event announces it, and a reminder goes out the
  day before to whoever said they were coming. Both are queued as jobs, so a redeploy costs a
  retry rather than the message.
- **Telegram**: a member gets a code from their profile page and sends it to the bot,
  which then answers `/events` and `/whoami` for them. The bot holds no authority of its
  own; every answer goes through the same permission table as the web app.
- **Email**, for members who never link a chat: one POST to a provider's API, no dependency.
- **Per-member notification settings**: a member can switch announcements or reminders off, or a
  channel off. What they get because of something they did is always sent.
- **A calendar feed** per member, signed with the session secret, that any calendar app can
  subscribe to, offered from the calendar page and the profile page alike: one press for Google,
  Outlook or anything that speaks `webcal:`, and the url itself to paste anywhere else. One event
  on its own is an `.ics` the API writes, or a filled-in compose page at Google or Outlook.
- **CSV exports** of an attendance sheet and of the roster, for the committee report.
- **A public page**, optionally: the next few events without signing in.
- **Search**, over the roster and the whole archive of events. A word typed into the event search
  reaches into the past, because the event somebody is trying to remember has usually happened.
- **Three languages**: English, German and French, chosen by the club and applied to every page and
  every notice it sends, times included: a notice is written on the club's own clock. A club that
  has chosen none follows the reader's browser. A refusal from the API is a diagnostic and stays in
  English, as does the bot.
- **A queue screen**: everything the app owes itself, live. What is waiting, what a drainer is
  running, what has been done and what a chat provider refused three times, with its reason. An
  admin can run a waiting job now, put a failed one back, or throw either away.
- **A design the club owns**: name, tagline, blurb, accent colour, palette, typeface, corners and
  spacing, all stored rather than configured, because a committee changes them without having a
  shell. Images are uploaded into the database beside everything else, so the logo survives the
  same backup as the roster.
- **Who may join**: a list of eduID home organisations. Set it and an identity from anywhere else
  is turned away at sign-in rather than landing on the roster as a stranger.
- **An audit trail** of every admin act, readable on the settings page.

## Backups

SQLite: `clubbie backup clubbie-$(date +%F).db` writes a consistent copy while the server runs
(a plain file copy under a writer is how a club ends up with a backup that will not open). Put it
in cron, keep a week of them, and test a restore by pointing `DATABASE_URL` at the copy.

Postgres: `pg_dump`, which knows how to do it better than this would.

## Layout

```
packages/
  core    domain types, the permission table, the paths of the web app
  store   kysely over sqlite or postgres
  auth    oauth sign-in and sessions
  api     the hono app, exports, the calendar feed
  notify  what the club sends, and the channels it goes out on
  bot     telegram
  server  config, wiring, cli, the scheduler, runtimes
  term    styling, markup, alignment
  log     structured logging
  diag    miette-style diagnostics
  web     the svelte 5 spa
```

`AGENTS.md` is the source of truth for how the code is written. `ROADMAP.md` is what is
not built yet.

## Development

```sh
bun run check       # typecheck + lint + test, with a coverage floor
bun run fix         # apply every safe fix
bun run seed        # development data, into an empty database
```

The store suite runs against whatever `TEST_DATABASE_URL` names, so `TEST_DATABASE_URL=postgres://…
bun test packages/store` proves the other dialect. CI runs both.

It is a variable of its own rather than `DATABASE_URL` for a reason worth knowing: Bun loads `.env`
for `bun test` as well, and the fixture empties every table in the database it opens. Pointing it at
the database a dev server is using would delete the club.
