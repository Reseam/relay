import type { Config } from "../config";
import { linkLabel, request, type PostTarget } from "./http";

type RedditConfig = NonNullable<Config["reddit"]>;
type Token = { value: string; expiresAt: number };

export const USER_AGENT = "server:app.reseam.relay:1.0";

export function redditReleases(fetcher: typeof fetch, config: RedditConfig): PostTarget {
  let token: Token | undefined;

  async function accessToken() {
    if (token && token.expiresAt > Date.now()) return token.value;
    const response = await request(fetcher, "https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: config.refreshToken }),
    });
    const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number };
    token = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
    return token.value;
  }

  return {
    name: "reddit",
    platform: "reddit",
    async send(item) {
      const response = await request(fetcher, "https://oauth.reddit.com/api/submit", {
        method: "POST",
        headers: { Authorization: `Bearer ${await accessToken()}`, "User-Agent": USER_AGENT },
        body: new URLSearchParams({
          sr: config.subreddit,
          kind: "self",
          api_type: "json",
          title: item.title,
          text: `${item.body}\n\n[${linkLabel(item)}](${item.url})`,
        }),
      });
      // Reddit reports a rejected post (flair required, rate limit, banned word) as 200 with errors.
      const { json } = (await response.json()) as { json: { errors: string[][] } };
      if (json.errors.length) throw new Error(`reddit rejected the post: ${JSON.stringify(json.errors)}`);
    },
  };
}
