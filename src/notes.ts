type ChangeKind = "feat" | "fix" | "perf";

const SECTIONS: Record<ChangeKind, string> = { feat: "New", fix: "Fixed", perf: "Faster" };
const CONVENTIONAL = /^\s*[-*+]\s+(\w+)(?:\(([^)]+)\))?!?:\s+(.+)$/;
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

/**
 * Release notes as reseam.app and Reseam Manager show them: `- type(scope): text` commit lines become New, Fixed
 * and Faster, by app, and internal commits are left out. Lines that are not commits stay as written.
 */
export function releaseNotes(description: string) {
  const sections = new Map<ChangeKind, string[]>();
  const prose: string[] = [];
  for (const line of description.split("\n")) {
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
