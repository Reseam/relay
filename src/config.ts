import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const PlatformSchema = Type.Union([Type.Literal("discord"), Type.Literal("telegram"), Type.Literal("reddit"), Type.Literal("x")]);

const SettingsSchema = Type.Object({
  everything: Type.Object({
    exclude: Type.Array(Type.String(), { default: [] }),
  }, { default: {} }),
  releases: Type.Object({
    repos: Type.Record(Type.String(), Type.Object({ name: Type.String(), index: Type.String(), page: Type.String() }), { default: {} }),
    prereleases: Type.Array(PlatformSchema, { default: [] }),
    maintenance: Type.Array(PlatformSchema, { default: [] }),
  }, { default: {} }),
  api: Type.Object({
    announcement_page: Type.String(),
    request_page: Type.String(),
  }),
});

export type Platform = Static<typeof PlatformSchema>;
export type Settings = Static<typeof SettingsSchema>;

export type TelegramChat = { chatId: string; threadId?: string };

export type Config = {
  port: number;
  dbPath: string;
  webhookSecret: string;
  apiSecret?: string;
  settings: Settings;
  discord: { feed?: string; releases?: string; requests?: string };
  telegram?: { token: string; feed?: TelegramChat; releases?: TelegramChat };
  reddit?: { clientId: string; clientSecret: string; refreshToken: string; subreddit: string };
  x?: { authToken: string; ct0: string };
};

export function parseSettings(toml: string): Settings {
  return Value.Parse(SettingsSchema, Bun.TOML.parse(toml));
}

export async function readConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  const webhookSecret = env.WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("WEBHOOK_SECRET is required");

  const reddit = group(env, ["REDDIT_CLIENT_ID", "REDDIT_REFRESH_TOKEN"]);
  const x = group(env, ["X_AUTH_TOKEN", "X_CT0"]);

  return {
    port: Number(env.PORT || 4100),
    dbPath: env.DB_PATH || "data/relay.db",
    webhookSecret,
    apiSecret: env.API_SECRET || undefined,
    settings: parseSettings(await Bun.file(env.CONFIG_PATH || "config.toml").text()),
    discord: { feed: env.DISCORD_FEED_WEBHOOK, releases: env.DISCORD_RELEASES_WEBHOOK, requests: env.DISCORD_REQUESTS_WEBHOOK },
    telegram: env.TELEGRAM_BOT_TOKEN
      ? {
          token: env.TELEGRAM_BOT_TOKEN,
          feed: chat(env.TELEGRAM_FEED_CHAT, env.TELEGRAM_FEED_THREAD),
          releases: chat(env.TELEGRAM_RELEASES_CHAT, env.TELEGRAM_RELEASES_THREAD),
        }
      : undefined,
    reddit: reddit && {
      clientId: reddit.REDDIT_CLIENT_ID,
      clientSecret: env.REDDIT_CLIENT_SECRET ?? "",
      refreshToken: reddit.REDDIT_REFRESH_TOKEN,
      subreddit: env.REDDIT_SUBREDDIT || "reseamapp",
    },
    x: x && { authToken: x.X_AUTH_TOKEN, ct0: x.X_CT0 },
  };
}

function chat(chatId: string | undefined, threadId: string | undefined): TelegramChat | undefined {
  return chatId ? { chatId, threadId: threadId || undefined } : undefined;
}

// A target is on when all of its variables are set. Setting only some of them is a mistake, not a choice.
function group<K extends string>(env: NodeJS.ProcessEnv, keys: K[]): Record<K, string> | undefined {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length === keys.length) return undefined;
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}`);
  return Object.fromEntries(keys.map((key) => [key, env[key]])) as Record<K, string>;
}
