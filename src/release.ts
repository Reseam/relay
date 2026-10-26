import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Settings } from "./config";
import type { Event } from "./forgejo";

const IndexSchema = Type.Object({
  releases: Type.Array(Type.Object({ version: Type.String(), description: Type.String() })),
});

const ANNOUNCE_WINDOW_MS = 60 * 60 * 1000;
export const USER_FACING = /^\s*[-*+]\s+(feat|fix|perf)(\(|!|:)/m;

export type Release = { repo: string; product: string; version: string; tag: string; notes: string; prerelease: boolean; index: string; page: string };
export type Timing = { pollMs: number; waitMs: number };

// Publishing a draft reaches the webhook as "updated", never "published". Forgejo stamps published_at
// when a draft goes public but keeps it on later edits, so a recent published_at tells the two apart.
export function toRelease(event: Event, settings: Settings["releases"]): Release | undefined {
  if (event.type !== "release" || event.payload.action === "deleted") return undefined;
  const { release, repository } = event.payload;
  const repo = settings.repos[repository.full_name];
  if (!repo || release.draft) return undefined;
  if (Date.now() - Date.parse(release.published_at) > ANNOUNCE_WINDOW_MS) return undefined;
  return {
    repo: repository.full_name,
    product: repo.name,
    version: release.tag_name.replace(/^v/, ""),
    tag: release.tag_name,
    notes: release.body.trim(),
    prerelease: release.prerelease,
    index: repo.index,
    page: repo.page,
  };
}

/**
 * The release's notes in the index, once it lists them. Posts link to pages and Manager updates that read the
 * index, so posting before the cached index has the release would send people to nothing new.
 */
export async function listedNotes(fetcher: typeof fetch, release: Release, timing: Timing) {
  for (const deadline = Date.now() + timing.waitMs; Date.now() < deadline; await Bun.sleep(timing.pollMs)) {
    const response = await fetcher(release.index, { headers: { Accept: "application/json" } }).catch(() => undefined);
    if (!response?.ok) continue;
    const listed = Value.Parse(IndexSchema, await response.json()).releases.find((entry) => entry.version === release.version);
    if (listed) return listed.description;
  }
  console.error(`${release.repo} ${release.tag}: not in ${release.index} after ${timing.waitMs / 60_000} min, posting anyway`);
}
