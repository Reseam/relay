import type { TelegramChat } from "../config";
import type { Media } from "../notes";
import type { Notice, Segment } from "../notice";
import { linkLabel, request, type FeedTarget, type PostTarget } from "./http";

const MESSAGE_LENGTH = 4096;
const ALBUM = 10;
const SINGLE: Record<Media["kind"], [method: string, field: string]> = {
  image: ["sendPhoto", "photo"],
  animation: ["sendAnimation", "animation"],
  video: ["sendVideo", "video"],
};

export function telegramFeed(fetcher: typeof fetch, token: string, chat: TelegramChat): FeedTarget {
  return {
    name: "telegram feed",
    send: (notice: Notice) =>
      send(fetcher, token, chat, [
        link(notice.title, notice.url),
        ...notice.body.map((line) => line.map(segment).join("")),
      ]),
  };
}

export function telegramPosts(fetcher: typeof fetch, name: string, token: string, chat: TelegramChat): PostTarget {
  return {
    name,
    platform: "telegram",
    async send(item) {
      // A release is announced even when Telegram cannot fetch its media.
      await show(fetcher, token, chat, item.media).catch((error: Error) => console.error(`${name}: ${error.message}`));
      await send(fetcher, token, chat, [
        `<b>${escape(item.title)}</b>`,
        "",
        ...item.body.split("\n").map((line) => escape(line).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")),
        "",
        link(linkLabel(item), item.url),
      ]);
    },
  };
}

async function send(fetcher: typeof fetch, token: string, chat: TelegramChat, lines: string[]) {
  await call(fetcher, token, chat, "sendMessage", { text: fit(lines), parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

// Telegram fetches each address itself. Images and videos go out as one album; an album cannot hold an animation.
async function show(fetcher: typeof fetch, token: string, chat: TelegramChat, media: Media[]) {
  const album = media.filter((item) => item.kind !== "animation").slice(0, ALBUM);
  const grouped = album.length > 1;
  if (grouped) {
    await call(fetcher, token, chat, "sendMediaGroup", {
      media: album.map((item) => ({ type: item.kind === "video" ? "video" : "photo", media: item.url })),
    });
  }
  for (const item of grouped ? media.filter((item) => item.kind === "animation") : media) {
    const [method, field] = SINGLE[item.kind];
    await call(fetcher, token, chat, method, { [field]: item.url });
  }
}

async function call(fetcher: typeof fetch, token: string, chat: TelegramChat, method: string, payload: Record<string, unknown>) {
  await request(fetcher, `https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat.chatId, message_thread_id: chat.threadId, ...payload }),
  });
}

// Drops whole lines from the end so a cut never splits an HTML tag.
function fit(lines: string[]) {
  const kept = [...lines];
  while (kept.join("\n").length > MESSAGE_LENGTH) kept.splice(-2, 1);
  return kept.join("\n");
}

function segment(part: Segment) {
  return typeof part === "string" ? escape(part) : link(part.text, part.url);
}

function link(text: string, url: string) {
  return `<a href="${escape(url)}">${escape(text)}</a>`;
}

function escape(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
