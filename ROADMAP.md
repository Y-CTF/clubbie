# Roadmap

What clubbie does not do yet, in the order it is worth doing. Each entry says what is missing and
where it lands, because the shape of the codebase already decides most of it.

The daily path is complete: a club can be run from the web app without anybody reaching for
`curl`. What is below is either genuinely absent, or deliberately not built and worth saying so.

## 1. Worth doing next

- **A digest.** One message a week beats five, for a club that meets often. It is a job kind, a
  preference, and a phrase in each catalogue; the machinery is already there.
- **A design preview.** The design page applies what was saved, so choosing a palette means
  saving to see it. Applying the tokens live while the form changes is a handful of lines in
  `Identified.paint` and a decision about what "cancel" then means.
- **Optimistic updates beyond the sheet.** `Query.patch` shows a change before the server has
  agreed to it and rolls it back on a refusal, and only the attendance sheet uses it. Answering an
  event is the next screen that wants it, and it is one call site rather than a new mechanism.
- **Reordering the kinds.** They carry a position and the store sorts by it, and nothing in the
  settings page lets a committee drag one above another: the order is the order they were added.
- **Search that ranks.** Both searches are a substring scan and return whatever the index order
  gives. For a few hundred rows that is right, and a club with three years of events would rather
  the title matched before the description did.

## 2. Notification depth

- **Bounce handling.** The email channel reports a provider's refusal and retries three times, and
  now a person can see the failure and retry it by hand. What it still does not do is notice that
  an address is permanently dead and stop trying, which needs a webhook the provider posts to and a
  flag on the member.
- **A webhook for the bot.** Long polling is right for one process; a Workers deployment would
  need `bot.handleUpdate` behind a route instead.
- **The bot speaks English only.** Its replies are markup written in `bot/`, and the club's
  language does not reach them. The fix is the same shape as `notify/src/words.ts`.

## 3. Product edges

- **Photos on an event.** A club uploads a logo and a banner, and those are two images with a
  hard size cap. A picture per event is a gallery, which is object storage, which is the first
  thing that does not fit in one file.
- **A member directory.** Names are visible on sheets; contact details deliberately are not. If a
  club wants a directory, it wants per-member consent with it.
- **More languages.** Adding one is two catalogues, a line in `LOCALES` and the language's own
  name in `Words.NAMES`, and the compiler lists every string that is missing. It is deliberately
  not open-ended: a language nobody maintains is a page half in English.

## 4. Operations

- **A D1 dialect**, if Workers becomes a real target. The seam is `store/dialect/`; the Workers
  entry point is already `worker.ts` and already skips the filesystem. The scheduler would move
  to a cron trigger calling `clubbie work`.
- **Metrics.** The logs carry timings; nothing aggregates them. A club this size does not need
  Prometheus, and a `/metrics` route would be the smallest honest answer if it ever does.
- **A second process.** The job queue takes a lease and re-asserts `pending` when it claims, so
  two drainers are safe today. The rate limiter is per process, and would need moving into the
  database to be exact.

## Deliberately out of scope

- **Several clubs on one deployment.** The whole design leans on one file, one process, one club.
  A second club is a second copy, and every "just add a tenant id" is a permission bug waiting to
  be written.
- **Payments.** Membership fees are a bank's problem, and the moment money is involved the
  compliance surface is larger than the rest of this app put together.
- **A mobile app.** The web app works on a phone. A wrapper around it would be a second thing to
  release.
- **A per-member language.** The club chooses one. An event title typed in German inside an English
  sentence reads worse than either language on its own, and a committee that writes in two
  languages has a writing problem rather than a software one.

## Known gaps in what exists

Honest notes about what is built, rather than future features.

- **`node:sqlite` needs Node 24**, or a flag on 22. Bun is unaffected. If Node support matters,
  the third binding (`better-sqlite3`) slots into `SqliteDialect.open`.
- **A club with no timezone set steps in the runtime's.** `Club.timezone` is what `Expand` reads
  and hands to `Recur` when it is set; the runtime's own zone is the fallback, which is `TZ` where
  it is set and UTC in a container that carries no zone at all.
- **Changing the club's timezone moves every repeating night.** It has to: the rule is a wall
  clock, and a wall clock in another zone is a different instant. The nights the rule no longer
  produces are dropped and stamped again, so the answers on them go too, and nothing warns about
  that before it is saved.
- **Uploaded images live in the database, capped at 512 kB each.** That is the price of one file
  to back up. A club that wants a photo gallery wants object storage, which is a different app.
- **Restricting who may join needs a provider that says where an identity is from.** eduID
  releases `schac_home_organization`; GitHub has no such notion, so a club with a list set turns
  every GitHub sign-in away rather than guessing.
- **An hour that happens twice is resolved rather than asked about.** A rule that lands inside a
  daylight saving change takes the second of the two, the one on standard time, and one that lands
  in the gap comes out one gap later on the clock: 02:30 reads back as 03:30. Documented in
  `Zone.instant`, pinned by a test, and no club schedules a meeting there.
- **Search is a scan.** `lower(col) like ?` over a few hundred rows, with no index. The one
  function that would change is `Search.any`.
- **The public page is one query deep.** It lists the next few events and nothing else: no
  detail page, no sign-up without an account.
- **Guests are per event.** The same friend at four events is four rows, and nothing links them.
  That is deliberate for now, and it is also why there is no guest history.
- **The rate limiter is in memory.** One process is the deployment this is for; a second process
  is a second window, which is a weaker limit rather than a broken one.
- **The bot has no tests.** Everything it decides goes through `Ability` and `Links`, which are
  tested, but its own command handlers are proved by using it. A fake `Api` for grammy would fix
  that and has not been worth it yet.
- **The SPA has no tests.** `Query`, `Typed` and the router are the parts worth having them, and
  they would need a browser runner the repo does not have. Everything they touch is typed against
  the API's own route types, which is what has caught the mistakes so far.
- **Attendance has no undo history.** Marking somebody present and unmarking them leaves the last
  state, and only the audit trail remembers that it happened.
