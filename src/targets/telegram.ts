import type { TelegramChat } from "../config";
import type { Notice, Segment } from "../notice";
import { linkLabel, request, type FeedTarget, type PostTarget } from "./http";

const MESSAGE_LENGTH = 4096;

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

export function telegramReleases(fetcher: typeof fetch, token: string, chat: TelegramChat): PostTarget {
  return {
    name: "telegram releases",
    platform: "telegram",
    send: (item) =>
      send(fetcher, token, chat, [
        `<b>${escape(item.title)}</b>`,
        "",
        ...item.body.split("\n").map(escape),
        "",
        link(linkLabel(item), item.url),
      ]),
  };
}

async function send(fetcher: typeof fetch, token: string, chat: TelegramChat, lines: string[]) {
  await request(fetcher, `https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chat.chatId,
      message_thread_id: chat.threadId,
      text: fit(lines),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
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
