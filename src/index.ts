import { openAnnounced } from "./announced";
import { createApp } from "./app";
import { readConfig } from "./config";
import { buildFeeds, createRelay } from "./relay";

const config = await readConfig();
const relay = createRelay(config.settings, buildFeeds(config, fetch), openAnnounced(config.dbPath), fetch, {
  pollMs: 20_000,
  waitMs: 15 * 60_000,
});
const app = createApp({ config, relay, version: process.env.VERSION ?? "dev" }).listen(config.port);

console.log(`Reseam Relay listening at http://${app.server?.hostname}:${app.server?.port}`);
console.log(`Targets: ${relay.targets.join(", ") || "none"}`);
