type ChangeKind = "feat" | "fix" | "perf";
export type Media = { name: string; url: string; kind: "image" | "animation" | "video" };

const SECTIONS: Record<ChangeKind, string> = { feat: "New", fix: "Fixed", perf: "Faster" };
const CONVENTIONAL = /^\s*[-*+]\s+(\w+)(?:\(([^)]+)\))?!?:\s+(.+)$/;
const MEDIA = /^\s*!\[([^\]]*)\]\((https:\/\/[^\s()]+)\)\s*$/;
const MEDIA_KINDS: Record<string, Media["kind"]> = { gif: "animation", mp4: "video", webm: "video" };
const ENGINE = /^\s*[-*+]\s+build:\s+require engine\s+(\S+)/m;
const APP_NAMES: Record<string, string> = {
  youtube: "YouTube",
  "youtube-music": "YouTube Music",
  tiktok: "TikTok",
  gmscore: "GmsCore",
};

function scopeName(scope: string) {
  return APP_NAMES[scope] ?? scope.split(/[-_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/** The images and videos a release shows: `reseam release` lists each as a Markdown image on a line of its own. */
export function releaseMedia(description: string): Media[] {
  return description.split("\n").flatMap((line) => {
    const [, name, url] = MEDIA.exec(line) ?? [];
    return url ? [{ name: name!, url, kind: MEDIA_KINDS[url.split(".").pop()!.toLowerCase()] ?? "image" }] : [];
  });
}

/**
 * Release notes as reseam.app and Reseam Manager show them: `- type(scope): text` commit lines become New, Fixed
 * and Faster, by app, and internal commits and media are left out. Other lines stay as written.
 */
export function releaseNotes(description: string) {
  const sections = new Map<ChangeKind, string[]>();
  const prose: string[] = [];
  for (const line of description.split("\n")) {
    if (MEDIA.test(line)) continue;
    const match = CONVENTIONAL.exec(line);
    if (!match) {
      prose.push(line);
      continue;
    }
    const [, type, scope, text] = match;
    const kind = type!.toLowerCase();
    if (!(kind in SECTIONS)) continue;
    const change = text!.charAt(0).toUpperCase() + text!.slice(1);
    sections.set(kind as ChangeKind, [...(sections.get(kind as ChangeKind) ?? []), scope ? `**${scopeName(scope)}:** ${change}` : change]);
  }
  const parts = [
    prose.join("\n").trim(),
    ...(Object.keys(SECTIONS) as ChangeKind[])
      .filter((kind) => sections.has(kind))
      .map((kind) => [`**${SECTIONS[kind]}**`, ...sections.get(kind)!.map((change) => `- ${change}`)].join("\n")),
  ].filter(Boolean);
  if (parts.length > 0) return parts.join("\n\n");
  const engine = ENGINE.exec(description)?.[1];
  return `Maintenance release with no changes to note${engine ? `. Runs on engine ${engine}` : ""}.`;
}
