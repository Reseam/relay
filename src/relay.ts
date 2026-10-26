import type { ApiEvent } from "./api";
import type { Announced } from "./announced";
import type { Config, Settings } from "./config";
import { repositoriesOf, type Event } from "./forgejo";
import { toNotice } from "./notice";
import { listedNotes, toRelease, USER_FACING, type Release, type Timing } from "./release";
import { discordFeed, discordReleases, discordRequests } from "./targets/discord";
import type { FeedTarget, Post, PostTarget, RequestTarget, Target } from "./targets/http";
import { redditReleases } from "./targets/reddit";
import { telegramFeed, telegramReleases } from "./targets/telegram";
import { xReleases } from "./targets/x";

export type Feeds = { everything: FeedTarget[]; posts: PostTarget[]; requests: RequestTarget[] };
export type Relay = ReturnType<typeof createRelay>;

export function buildFeeds(config: Config, fetcher: typeof fetch): Feeds {
  const { discord, telegram, reddit, x } = config;
  return {
    everything: [
      discord.feed && discordFeed(fetcher, discord.feed),
      telegram?.feed && telegramFeed(fetcher, telegram.token, telegram.feed),
    ].filter((target) => !!target),
    posts: [
      discord.releases && discordReleases(fetcher, discord.releases),
      telegram?.releases && telegramReleases(fetcher, telegram.token, telegram.releases),
      reddit && redditReleases(fetcher, reddit),
      x && xReleases(x),
    ].filter((target) => !!target),
    requests: [discord.requests && discordRequests(fetcher, discord.requests)].filter((target) => !!target),
  };
}

// Each target gets its own queue so a burst of events arrives in order and one slow target holds up no other.
export function createRelay(settings: Settings, feeds: Feeds, announced: Announced, fetcher: typeof fetch, timing: Timing) {
  const queues = new Map<string, Promise<void>>();
  const pending = new Set<Promise<void>>();

  function enqueue<T>(target: Target<T>, item: T) {
    const next = (queues.get(target.name) ?? Promise.resolve())
      .then(() => target.send(item))
      .catch((error: Error) => console.error(`${target.name}: ${error.message}`));
    queues.set(target.name, next);
  }

  const allowed = (kind: Post["kind"], target: PostTarget) =>
    kind === "prerelease" ? settings.releases.prereleases.includes(target.platform)
      : kind === "maintenance" ? settings.releases.maintenance.includes(target.platform)
      : true;

  function post(item: Post) {
    for (const target of feeds.posts.filter((target) => allowed(item.kind, target))) enqueue(target, item);
  }

  async function publish(release: Release) {
    const notes = await listedNotes(fetcher, release, timing);
    const kind = release.prerelease ? "prerelease" : notes === undefined || USER_FACING.test(notes) ? "release" : "maintenance";
    post({ kind, title: `${release.product} ${release.tag}`, body: release.notes, url: release.page.replace("{version}", release.version) });
  }

  return {
    targets: [...feeds.everything, ...feeds.posts, ...feeds.requests].map((target) => target.name),

    deliver(event: Event) {
      const repositories = repositoriesOf(event);
      if (repositories.some((repository) => !repository || repository.private)) return;

      const excluded = repositories.some((repository) => settings.everything.exclude.includes(repository!.full_name));
      const notice = excluded ? undefined : toNotice(event);
      if (notice) for (const target of feeds.everything) enqueue(target, notice);

      const release = toRelease(event, settings.releases);
      if (!release || (release.prerelease && settings.releases.prereleases.length === 0)) return;
      if (!announced.claim(release.repo, release.tag)) return;
      const task = publish(release).finally(() => pending.delete(task));
      pending.add(task);
    },

    receive(event: ApiEvent) {
      if (event.type === "announcement") {
        const { id, title, content } = event.announcement;
        post({ kind: "announcement", title, body: content ?? "", url: settings.api.announcement_page.replace("{id}", String(id)) });
        return;
      }
      const { id, title, body, app, status } = event.request;
      const notice = { title, body: body ?? "", app, hidden: status === "hidden", url: settings.api.request_page.replace("{id}", String(id)) };
      for (const target of feeds.requests) enqueue(target, notice);
    },

    idle: async () => {
      await Promise.all(pending);
      await Promise.all(queues.values());
    },
  };
}
