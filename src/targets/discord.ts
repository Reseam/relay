import type { Notice, Segment, Tone } from "../notice";
import { request, type FeedTarget, type PostTarget, type RequestTarget } from "./http";

type Embed = {
  title: string;
  url: string;
  description: string;
  color: number;
  author?: { name: string; url: string; icon_url: string };
};

const COLORS: Record<Tone, number> = { positive: 0x2ea043, negative: 0xd1242f, neutral: 0x5865f2 };

export function discordFeed(fetcher: typeof fetch, webhook: string): FeedTarget {
  return {
    name: "discord feed",
    send: (notice: Notice) =>
      post(fetcher, webhook, {
        title: truncate(notice.title, 256),
        url: notice.url,
        description: truncate(notice.body.map((line) => line.map(segment).join("")).join("\n"), 4096),
        color: COLORS[notice.tone],
        author: { name: notice.sender.login, url: notice.sender.html_url, icon_url: notice.sender.avatar_url },
      }),
  };
}

export function discordReleases(fetcher: typeof fetch, webhook: string): PostTarget {
  return {
    name: "discord releases",
    platform: "discord",
    send: (item) =>
      post(fetcher, webhook, {
        title: truncate(item.title, 256),
        url: item.url,
        description: truncate(item.body, 4096),
        color: item.kind === "announcement" ? COLORS.neutral : COLORS.positive,
      }),
  };
}

export function discordRequests(fetcher: typeof fetch, webhook: string): RequestTarget {
  return {
    name: "discord requests",
    send: (notice) =>
      post(fetcher, webhook, {
        title: truncate(notice.title, 256),
        url: notice.url,
        description: truncate(
          [notice.body, notice.app && `App: ${notice.app}`, notice.hidden && "Hidden by screening"].filter(Boolean).join("\n\n"),
          4096,
        ),
        color: notice.hidden ? COLORS.negative : COLORS.neutral,
      }),
  };
}

async function post(fetcher: typeof fetch, webhook: string, embed: Embed) {
  // Commit messages and issue text are user content: never let them ping anyone.
  await request(fetcher, webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
  });
}

function segment(part: Segment) {
  return typeof part === "string" ? escape(part) : `[${escape(part.text)}](${part.url})`;
}

function escape(text: string) {
  return text.replace(/([\\`*_~|[\]])/g, "\\$1");
}

function truncate(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
