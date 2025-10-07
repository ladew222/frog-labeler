// src/lib/peaks.ts
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { mapUriToDisk, relativeFromAudioRoot, getAudioRoot } from "@/lib/audioPath";

const exec = promisify(execFile);

// Defaults: override with env or CLI
export const CACHE_DIR = process.env.CACHE_DIR?.trim() || "/var/cache/frog-peaks";
export type PeakFmt = "json" | "dat";

export type PeakOptions = {
  concurrency: number;
  pps: number;     // pixels per second
  bits: 8 | 16;
  fmt: PeakFmt;
};

export function outPathFor(uri: string, fmt: PeakFmt = "json"): string | null {
  const rel = relativeFromAudioRoot(uri);
  if (!rel) return null;

  const leaf = rel.replace(/\.wav$/i, "");
  const subDir = join(CACHE_DIR, "peaks", dirname(rel));
  mkdirSync(subDir, { recursive: true });

  const ext = fmt === "json" ? ".peaks.json" : ".peaks.dat";
  return join(CACHE_DIR, "peaks", `${leaf}${ext}`);
}

async function runOne(
  uri: string,
  opts: PeakOptions
): Promise<"ok" | "skip" | "fail"> {
  if (!uri?.startsWith("/audio/")) return "skip";

  const disk = mapUriToDisk(uri);
  if (!disk) return "skip";

  const out = outPathFor(uri, opts.fmt);
  if (!out) return "skip";
  if (existsSync(out)) return "skip";

  const args = [
    "-i", disk,
    "-o", out,
    "--pixels-per-second", String(opts.pps),
    "-b", String(opts.bits),
    "--with-rms",               // nicer visuals
    "-z", "auto",
  ];
  if (opts.fmt === "json") args.push("--format", "json");
  // (default is .dat if you omit --format)

  try {
    await exec("audiowaveform", args);
    return "ok";
  } catch (e) {
    console.error("audiowaveform failed:", disk, e);
    return "fail";
  }
}

export async function processMany(
  uris: string[],
  opts: PeakOptions
): Promise<{ ok: number; fail: number; skipped: number; root: string }> {
  const root = getAudioRoot();
  const q = [...uris];
  let ok = 0, fail = 0, skipped = 0;

  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
    while (q.length) {
      const uri = q.shift()!;
      const r = await runOne(uri, opts);
      if (r === "ok") ok++;
      else if (r === "fail") fail++;
      else skipped++;
    }
  });

  await Promise.all(workers);
  return { ok, fail, skipped, root };
}
