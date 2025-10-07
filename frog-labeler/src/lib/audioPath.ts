// src/lib/audioPath.ts
import { join, normalize, isAbsolute } from "path";

const DEFAULT_AUDIO_ROOT = "/mnt/frogshare/Data";

/** Returns the on-disk base folder for audio files. */
export function getAudioRoot(): string {
  return process.env.AUDIO_ROOT?.trim() || DEFAULT_AUDIO_ROOT;
}

/** Map a URI like `/audio/Folder/2015/File.wav` → `/mnt/.../Folder/2015/File.wav`. */
export function mapUriToDisk(uri: string): string | null {
  if (!uri?.startsWith("/audio/")) return null;
  const rel = decodeURIComponent(uri.slice("/audio/".length));
  const safe = normalize(rel);
  if (!safe || safe.startsWith("..") || isAbsolute(safe)) return null;
  return join(getAudioRoot(), safe);
}

/** The path segment after `/audio/`, decoded. e.g. `Folder/2015/File.wav`. */
export function relativeFromAudioRoot(uri: string): string | null {
  if (!uri?.startsWith("/audio/")) return null;
  try {
    return decodeURIComponent(uri.slice("/audio/".length));
  } catch {
    return uri.slice("/audio/".length);
  }
}
