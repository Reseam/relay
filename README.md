<p align="center">
  <img src="https://reseam.app/logo.svg" alt="Reseam logo" width="96">
</p>

<h1 align="center">Reseam Relay</h1>

Posts what happens on [git.reseam.app](https://git.reseam.app) to Reseam's socials. One Forgejo org webhook sends every event here, and Relay fans it out to two feeds:

- **Everything.** Pushes, tags, issues, pull requests, reviews, comments, wiki edits, packages and CI runs, to Discord and Telegram.
- **Releases.** Published releases of the repositories listed in `config.toml`, to Discord, Telegram, Reddit and X.

Events from private repositories are always dropped. That includes a fork into or out of one, CI runs, and packages without a repository.

## Configure

`config.toml` decides what goes where:

```toml
[everything]
exclude = []                         # repositories left out of the everything feed

[releases]
prereleases = false                  # announce prereleases too

[releases.repos]
"reseam/patches" = "Reseam Patches"  # repository = name used in posts
```

Credentials come from the environment (see [`.env.example`](.env.example)). `WEBHOOK_SECRET` is required. Each target turns on when all of its variables are set:

| Target | Variables |
|---|---|
| Discord | `DISCORD_FEED_WEBHOOK`, `DISCORD_RELEASES_WEBHOOK` |
| Telegram | `TELEGRAM_BOT_TOKEN` with `TELEGRAM_FEED_CHAT` / `TELEGRAM_RELEASES_CHAT`, optional `*_THREAD` for a forum topic |
| Reddit | `REDDIT_CLIENT_ID`, `REDDIT_REFRESH_TOKEN`, optional `REDDIT_CLIENT_SECRET`, `REDDIT_SUBREDDIT` (default `reseamapp`) |
| X | `X_AUTH_TOKEN`, `X_CT0`: cookies of a logged-in x.com session |

Reddit posts go through an installed app (redirect uri `http://localhost:8080`, no secret), which any account can authorize. Run `REDDIT_CLIENT_ID=... bun scripts/reddit-auth.ts`, open the printed link while logged in as the posting account, and set the printed `REDDIT_REFRESH_TOKEN`. The account must be allowed to post in the subreddit.

X posts go through the x.com web API with [bird](https://github.com/steipete/bird), not the paid API. Each request carries an `x-client-transaction-id` signed the way the x.com web app does it ([x-client-transaction-id](https://github.com/Lqm1/x-client-transaction-id)); with bird's random one, X rejects posts as automated (error 226). Posting stops when the session cookies expire or X changes its web client.

`GET /v1/health` lists the targets that are on.

## Forgejo webhook

Add one webhook on the `reseam` organization:

- Type **Forgejo**, URL `https://<host>/v1/forgejo`, content type JSON
- Secret: the value of `WEBHOOK_SECRET`
- Trigger on **all events**

Relay answers 202 right away and posts afterwards, because Forgejo stops waiting after a few seconds. Each target posts in order and waits out rate limits. A failed post is logged and not retried.

## Develop

Needs [Bun](https://bun.sh).

```bash
bun install
WEBHOOK_SECRET=dev bun run dev  # server on port 4100
bun run typecheck
```

Built with Bun and Elysia.
