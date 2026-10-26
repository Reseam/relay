import { TwitterClient, type TwitterClientOptions } from "@steipete/bird";
import { ClientTransaction, fetchXDocument } from "x-client-transaction-id";
import type { Config } from "../config";
import type { PostTarget } from "./http";

type XConfig = NonNullable<Config["x"]>;

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
      const result = await client.tweet(`${headline}\n\n${item.url}`);
      if (!result.success) throw new Error(result.error);
    },
  };
}
