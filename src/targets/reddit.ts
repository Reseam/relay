import { Impit, type RequestInit } from "impit";
import type { Config } from "../config";
import type { Media } from "../notes";
import { linkLabel, type Post, type PostTarget } from "./http";

type RedditConfig = NonNullable<Config["reddit"]>;
type Lease = { args: { action: string; fields: { name: string; value: string }[] }; asset: { asset_id: string } };

const MEDIA_LABELS = { image: "Image", animation: "Animation", video: "Video" };
const INLINE_KINDS = { image: "img", animation: "gif", video: "video" };
const MIME_TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
};

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

  // Uploads and rich text refuse the cookie session; the web app's bearer token, which reddit.com hands the
  // session as the token_v2 cookie, opens them on oauth.reddit.com.
  async function bearer(): Promise<string> {
    const page = await impit.fetch("https://www.reddit.com/", { headers: { Cookie: cookie } });
    const token = page.headers.getSetCookie().join(";").match(/token_v2=([^;]+)/)?.[1];
    if (!token) throw new Error(`reddit.com answered ${page.status} without a token`);
    return token;
  }

  function oauth<T>(token: string, path: string, body: Record<string, string>): Promise<T> {
    return call<T>(`https://oauth.reddit.com${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: new URLSearchParams(body),
    });
  }

  // Reddit shows media in a text post only once it holds the file: it leases an upload slot, the file goes
  // to that slot, and the post refers to the asset.
  async function upload(media: Media, token: string): Promise<string> {
    const name = new URL(media.url).pathname.split("/").pop()!;
    const mimetype = MIME_TYPES[name.split(".").pop()!.toLowerCase()];
    if (!mimetype) throw new Error(`no media type for ${name}`);
    const file = await fetch(media.url);
    if (!file.ok) throw new Error(`${media.url} answered ${file.status}`);
    const lease = await oauth<Lease>(token, "/api/media/asset.json", { filepath: name, mimetype });
    const form = new FormData();
    for (const field of lease.args.fields) form.append(field.name, field.value);
    form.append("file", new Blob([await file.arrayBuffer()], { type: mimetype }), name);
    const stored = await fetch(new URL(lease.args.action, "https://reddit.com"), { method: "POST", body: form });
    if (!stored.ok) throw new Error(`reddit's upload answered ${stored.status}`);
    return `![${INLINE_KINDS[media.kind]}](${lease.asset.asset_id})`;
  }

  // Reddit reports a rejected post (flair required, rate limit, banned word) as 200 with errors.
  function accepted({ json }: { json: { errors: string[][] } }) {
    if (json.errors.length) throw new Error(`reddit rejected the post: ${JSON.stringify(json.errors)}`);
  }

  async function withMedia(item: Post, link: string) {
    const token = await bearer();
    const inline = await Promise.all(item.media.map((media) => upload(media, token)));
    const { output } = await oauth<{ output: unknown }>(token, "/api/convert_rte_body_format", {
      output_mode: "rtjson",
      markdown_text: [...inline, item.body, link].join("\n\n"),
    });
    const fields = { sr: config.subreddit, kind: "self", api_type: "json", title: item.title };
    accepted(await oauth(token, "/api/submit", { ...fields, richtext_json: JSON.stringify(output) }));
  }

  async function withLinks(item: Post, link: string) {
    const me = await call<{ data: { modhash: string } }>("https://www.reddit.com/api/me.json");
    const links = item.media.map((media) => `[${MEDIA_LABELS[media.kind]}](${media.url})`).join(" · ");
    const text = [item.body, links, link].filter(Boolean).join("\n\n");
    accepted(
      await call("https://www.reddit.com/api/submit", {
        method: "POST",
        headers: { "X-Modhash": me.data.modhash },
        body: new URLSearchParams({ sr: config.subreddit, kind: "self", api_type: "json", title: item.title, text }),
      }),
    );
  }

  return {
    name: "reddit",
    platform: "reddit",
    async send(item) {
      const link = `[${linkLabel(item)}](${item.url})`;
      if (!item.media.length) return withLinks(item, link);
      // A release is announced even when its media cannot be uploaded; it then links to each file.
      await withMedia(item, link).catch((error: Error) => {
        console.error(`reddit media: ${error.message}`);
        return withLinks(item, link);
      });
    },
  };
}
