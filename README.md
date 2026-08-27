<h1 align="center">clubbie</h1>

<p align="center">
  Event and member management for a small club, in one binary and one database file.
</p>

## Background

<a href="#installing"><small>cut the small talk and just let me install this</small></a>

We are a small CTF (Capture-the-flag) club established @[HEIG-VD](https://heig-vd.ch/) around
2020. Up until now, we were using Google Spreadsheets and Forms for enrollment, events
organization and attendance checking. Needless to say it was becoming quite tedious to manage as
we grew bigger and bigger (we are now around 50 members).

We began searching for existing solutions online, but couldn't find anything that suited our
needs:

- Free and Open Source Software (FOSS) - we don't want to depend on any third party service
- Easy to deploy and maintain (we don't have a dedicated sysadmin)
- Simple and user-friendly interface for both members and organizers
- Features tailored for club management (event enrollment, attendance tracking, member
  management, etc.)

So we decided to build our own solution, and `clubbie` was born !

Find more about us on our [website](https://yctf.ch/).

It is written for any association that runs on volunteers: a student CTF club, a choir, a hiking
group. Members sign in with an identity they already have, answer events, and get counted;
organisers admit members, publish events, take attendance, and are told who turned up. Nothing
else.

## Installing

### Docker Compose (recommended)

1. Clone this repository:

    ```bash
    git clone https://github.com/Y-CTF/clubbie.git
    cd clubbie
    ```

2. Copy the example environment file and configure your environment variables:

    ```bash
    cp docker/.env.example docker/.env
    ```

    It is `docker/.env` rather than the repository's own `.env` on purpose: what a container needs
    is not what a dev server needs, starting with where the database lives. Edit it and configure:
    - `SESSION_SECRET`: generate with `openssl rand -base64 32`
    - `BASE_URL`: the origin members reach, which is the address behind your proxy in production
    - **Authentication (choose at least one)**:
      - **GitHub**: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from
        [GitHub OAuth Apps](https://github.com/settings/developers)
      - **eduID**: `EDUID_CLIENT_ID` and `EDUID_CLIENT_SECRET` from
        [eduID](https://www.eduid.ch/) (Swiss academic identity)
    - `DATABASE_URL`: leave it alone for SQLite in the volume, or point it at the Postgres
      profile below

3. Get it up and running:

    ```bash
    docker compose -f docker/compose.yml up -d
    ```

    Podman is the same command with `podman compose`, and the image is built from
    `docker/Containerfile` either way.

4. Access the interface at `http://localhost:3000`.

The database, and every image the club uploads, live in the `clubbie-data` volume, so the image
stays disposable and an upgrade is `up -d --build`. For Postgres instead of SQLite, set
`DATABASE_URL=postgres://clubbie:clubbie@postgres:5432/clubbie` in `docker/.env` and start the
profile:

```bash
docker compose -f docker/compose.yml --profile postgres up -d
```

> [!WARNING]
> The first person to sign in becomes the admin. Everyone after them arrives as `pending` and
> waits to be admitted.

### Manual installation

#### Prerequisites

- **Bun** 1.2 or higher (install with `curl -fsSL https://bun.sh/install | bash`)
- **Git**
- **PostgreSQL** 16 or higher, only if you would rather not use SQLite. There is nothing else to
  install for SQLite: the database is a file the process creates.

#### Installation Steps

1. Clone the repository:

    ```bash
    git clone https://github.com/Y-CTF/clubbie.git
    cd clubbie
    ```

2. Install dependencies:

    ```bash
    bun install
    ```

3. Configure environment variables:

    Copy the example environment file:

    ```bash
    cp .env.example .env
    ```

    Edit `.env` and configure:

    ```bash
    # Where the database lives. A file, or a Postgres you already run.
    DATABASE_URL="sqlite:clubbie.db"
    # DATABASE_URL="postgres://postgres:password@localhost:5432/clubbie"

    # Generate a secret (run this command and paste the output)
    # openssl rand -base64 32
    SESSION_SECRET="your-generated-secret-here"

    # The origin members reach. OAuth redirects and every link in a reminder are built from it.
    BASE_URL="http://localhost:3000"

    # Authentication (choose at least one)

    # Option 1: GitHub OAuth (recommended for general use)
    GITHUB_CLIENT_ID="your-github-client-id"
    GITHUB_CLIENT_SECRET="your-github-client-secret"

    # Option 2: eduID OIDC (Swiss academic identity)
    EDUID_CLIENT_ID="your-eduid-client-id"
    EDUID_CLIENT_SECRET="your-eduid-client-secret"
    ```

    GitHub credentials come from [GitHub OAuth Apps](https://github.com/settings/developers),
    eduID's from [eduID](https://www.eduid.ch/). A provider with only half its credentials set is
    refused at boot rather than at the redirect, and a deployment with no provider configured says
    so on the sign-in page. Which eduID home organisations may join is a club setting, not an
    environment variable: set it on the settings page and an identity from anywhere else is turned
    away at sign-in.

4. Run database migrations:

    ```bash
    bun run migrate
    ```

    Booting the server does this too. The command exists so a deployment can apply the schema
    before it starts taking requests.

5. (Optional) Seed the database with sample data:

    ```bash
    bun run seed
    ```

6. Start the development server:

    ```bash
    bun run dev
    ```

    The API listens on `:3000` and the SPA on `:5173`, which is the one to open while developing.

7. Access the application at `http://localhost:5173`

> [!TIP]
> The first person to sign in becomes the admin. Everyone after them arrives as `pending` and
> waits to be admitted. `bun run migrate && bun packages/server/src/main.ts admin you@example.com`
> promotes somebody later.

### Deploying without a container

For a real deployment, one binary serves the API, the built SPA and the scheduler on one origin:

```bash
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

Put it behind a reverse proxy that terminates TLS, set `BASE_URL` to the public origin and
`TRUST_PROXY` if that proxy rewrites `x-forwarded-for`.

### Optional: Telegram Bot Setup

If you want announcements and reminders to reach members in a chat:

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token

2. Set it in `.env`:

    ```bash
    TELEGRAM_TOKEN="your-telegram-bot-token"
    ```

3. Restart the server. The bot runs inside the same process, so there is nothing else to start.

A member links their account from their profile page: they take a code and send it to the bot,
which then answers `/events` and `/whoami` for them. The bot holds no authority of its own; every
answer goes through the same permission table as the web app.

### Optional: Email

For members who never link a chat. The sender is always needed; what else is depends on which
transport it goes over:

```bash
EMAIL_FROM="clubbie@yourclub.example"
EMAIL_TRANSPORT="resend"          # or postmark, sendgrid, mailgun, brevo, mailjet, smtp
EMAIL_API_KEY="your-provider-api-key"
```

| Transport | Also needs |
| --- | --- |
| `resend` (default), `postmark`, `sendgrid`, `brevo` | `EMAIL_API_KEY` |
| `mailgun` | `EMAIL_API_KEY`, `EMAIL_DOMAIN` |
| `mailjet` | `EMAIL_API_KEY`, `EMAIL_API_SECRET` |
| `smtp` | `EMAIL_SMTP_URL`, `smtp://user:pass@host:587` |

Everything but SMTP is one POST and no dependency. SMTP uses `nodemailer`, which is optional and
loaded at the first send. `EMAIL_ENDPOINT` overrides where a provider's API lives, for another
region or a relay. A transport that is missing something is named at boot, not at the first
reminder.

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
| `EMAIL_FROM` | unset | the address notices come from; required for any email at all |
| `EMAIL_TRANSPORT` | `resend` | `resend`, `postmark`, `sendgrid`, `mailgun`, `brevo`, `mailjet`, `smtp` |
| `EMAIL_API_KEY` / `EMAIL_API_SECRET` | unset | the key, and the second half of it for Mailjet |
| `EMAIL_DOMAIN` | unset | Mailgun's sending domain, which is part of its url |
| `EMAIL_SMTP_URL` | unset | `smtp://user:pass@host:587` |
| `EMAIL_ENDPOINT` | the transport's | another region, a relay, a test double |
| `TZ` | the host's | read by the runtime, not by the config: the wall clock a repeating event keeps when the club has set no timezone. Not validated at boot, and an empty value means UTC |

Every sign-in provider is a client id and a secret, and the ones that speak OpenID Connect take a
private key instead if the provider asked for one (`private_key_jwt`):

| Provider | Variables | Issuer |
| --- | --- | --- |
| eduID | `EDUID_CLIENT_ID` / `EDUID_CLIENT_SECRET` | `https://login.eduid.ch`, or `EDUID_ISSUER` |
| Google | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `https://accounts.google.com` |
| Microsoft | `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | every tenant, or one in `MICROSOFT_ISSUER` |
| GitLab | `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` | `https://gitlab.com`, or `GITLAB_ISSUER` |
| Anything else | `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | `OIDC_ISSUER`, required |
| GitHub | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | not OIDC |
| Discord | `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | not OIDC |

`<PROVIDER>_PRIVATE_KEY` is a PKCS#8 PEM (with `\n` written literally if the value has to be one
line), `<PROVIDER>_KEY_ID` the `kid` the public half was registered under, and
`<PROVIDER>_KEY_ALGORITHM` what it signs with, `RS256` by default. Set a key and the secret is not
needed.

Who a club lets in is a setting rather than a variable: eduID names one academic institution,
GitHub an organisation, Discord a server, each written `provider:name` on the settings page.

## Backups

SQLite: `clubbie backup clubbie-$(date +%F).db` writes a consistent copy while the server runs
(a plain file copy under a writer is how a club ends up with a backup that will not open). Put it
in cron, keep a week of them, and test a restore by pointing `DATABASE_URL` at the copy.

Postgres: `pg_dump`, which knows how to do it better than this would.

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

`AGENTS.md` is the source of truth for how the code is written, and `ROADMAP.md` is what is not
built yet.

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt))
- MIT license ([LICENSES/MIT.txt](LICENSES/MIT.txt))

at your option, which is `MIT OR Apache-2.0` in one line. Unless you say otherwise, a contribution
you submit for inclusion is dual licensed the same way.
