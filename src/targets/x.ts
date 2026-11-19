import { TwitterClient, type TwitterClientOptions } from "@steipete/bird";
import { ClientTransaction, fetchXDocument } from "x-client-transaction-id";
import type { Config } from "../config";
import type { Media } from "../notes";
import type { PostTarget } from "./http";

type XConfig = NonNullable<Config["x"]>;

const PICTURES = 4;

// x.com rejects a post as automated (error 226) unless its x-client-transaction-id signs the method and
// path the way the web app does. bird sends a random one, so every request gets a real one here.
class WebClient extends TwitterClient {
  constructor(
    options: TwitterClientOptions,
    private readonly transaction: ClientTransaction,
  ) {
    super(options);
  }

  protected override async fetchWithTimeout(url: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    const id = await this.transaction.generateTransactionId(init.method ?? "GET", new URL(url).pathname);
    headers.set("x-client-transaction-id", id);
    return super.fetchWithTimeout(url, { ...init, headers });
  }
}

// A post holds four images, or one video or animation.
async function attach(client: TwitterClient, media: Media[]) {
  const pictures = media.filter((item) => item.kind === "image").slice(0, PICTURES);
  return Promise.all(
    (pictures.length > 0 ? pictures : media.slice(0, 1)).map(async (item) => {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`${item.url} answered ${response.status}`);
      const uploaded = await client.uploadMedia({
        data: new Uint8Array(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type")!,
        alt: item.name,
      });
      if (!uploaded.mediaId) throw new Error(uploaded.error);
      return uploaded.mediaId;
    }),
  );
}

// Posts as the logged-in web session, so it breaks when the cookies expire or X changes its web API.
export function xReleases(config: XConfig): PostTarget {
  const cookies = { authToken: config.authToken, ct0: config.ct0, cookieHeader: null, source: "env" };
  return {
    name: "x",
    platform: "x",
    async send(item) {
      // The signing keys live in the x.com page and rotate, so they are read fresh for each post.
      const client = new WebClient({ cookies }, await ClientTransaction.create(await fetchXDocument()));
      const headline = item.kind === "announcement" ? item.title : `${item.title} is out.`;
      // A release is announced even when its media cannot be attached.
      const media = await attach(client, item.media).catch((error: Error) => {
        console.error(`x: ${error.message}`);
        return [];
      });
      const result = await client.tweet(`${headline}\n\n${item.url}`, media);
      if (!result.success) throw new Error(result.error);
    },
  };
}
