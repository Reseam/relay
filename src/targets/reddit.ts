import { Impit, type RequestInit } from "impit";
import type { Config } from "../config";
import { linkLabel, type PostTarget } from "./http";

type RedditConfig = NonNullable<Config["reddit"]>;

// Posts as the logged-in web session, since Reddit no longer issues API apps. Reddit blocks the session
// unless the request has a browser's TLS fingerprint and the session was created from the server's IP;
// posting stops when the session ends.
export function redditReleases(config: RedditConfig): PostTarget {
  const impit = new Impit({ browser: "chrome" });
  const cookie = `reddit_session=${config.session}`;

  async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await impit.fetch(url, { ...init, headers: { Cookie: cookie, ...init.headers } });
    const text = await response.text();
    if (!response.ok || !text.startsWith("{")) {
      throw new Error(`reddit answered ${response.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text) as T;
  }

  return {
    name: "reddit",
    platform: "reddit",
    async send(item) {
      const me = await call<{ data: { modhash: string } }>("https://www.reddit.com/api/me.json");
      const { json } = await call<{ json: { errors: string[][] } }>("https://www.reddit.com/api/submit", {
        method: "POST",
        headers: { "X-Modhash": me.data.modhash },
        body: new URLSearchParams({
          sr: config.subreddit,
          kind: "self",
          api_type: "json",
          title: item.title,
          text: `${item.body}\n\n[${linkLabel(item)}](${item.url})`,
        }),
      });
      // Reddit reports a rejected post (flair required, rate limit, banned word) as 200 with errors.
      if (json.errors.length) throw new Error(`reddit rejected the post: ${JSON.stringify(json.errors)}`);
    },
  };
}
