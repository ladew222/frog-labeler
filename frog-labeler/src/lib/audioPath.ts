import { join, normalize, isAbsolute } from "path";

/** never allow absolute paths or .. traversal */
export function safeJoin(base: string, segments: string[]) {
  const rel = normalize(segments.join("/"));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return join(base, rel);
}

/** Map a URI like /audio/FOLDER/A/B.wav -> disk path under AUDIO_ROOT */
export function mapUriToDisk(uri: string) {
  const base = process.env.AUDIO_ROOT || join(process.cwd(), "public", "audio");
  if (!uri.startsWith("/audio/")) return null;
  const rest = uri.slice("/audio/".length).split("/");
  return safeJoin(base, rest);
}
