// src/lib/peaks.ts
import { promisify } from "util";
import { execFile } from "child_process";
import { dirname, join } from "path";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { relativeFromAudioRoot } from "./audioPath";

const exec = promisify(execFile);

export type PeaksOpts = {
  cacheDir?: string;            // base cache dir (default /var/cache/frog-peaks)
  fmt?: "json" | "dat";         // output format
  pixelsPerSecond?: number;     // audiowaveform --pixels-per-second
  bits?: 8 | 16;                // audiowaveform -b
  fft?: number;                 // optional --fft-size
  concurrency?: number;         // parallel workers
  silenceErrors?: boolean;      // if true, don't throw on single-file failures
};

const DEFAULTS: Required<PeaksOpts> = {
  cacheDir: process.env.CACHE_DIR || "/var/cache/frog-peaks",
  fmt: "json",
  pixelsPerSecond: 50,
  bits: 8,
  fft: 0,
  concurrency: 2,
  silenceErrors: true,
};

export type PeaksTarget = {
  uri: string;       // DB URI, e.g. /audio/INDU08/2015/foo.wav
  diskPath: string;  // resolved absolute file path
};

/** Compute destination path inside cache, mirroring the audio folder structure */
export function outPathFor(uri: string, opts: PeaksOpts = {}): string | null {
  const rel = relativeFromAudioRoot(uri);
  if (!rel) return null;
  const { cacheDir, fmt } = { ...DEFAULTS, ...opts };
  const base = join(cacheDir, "peaks", rel); // …/peaks/INDU08/.../file.wav
  return base.replace(/\.wav$/i, `.peaks.${fmt}`);
}

/** Process one file if missing; return output path or null if skipped/failed */
export async function processOne(t: PeaksTarget, opts: PeaksOpts = {}): Promise<string | null> {
  const cfg = { ...DEFAULTS, ...opts };
  const out = outPathFor(t.uri, cfg);
  if (!out) return null;

  if (existsSync(out)) return out;

  mkdirSync(dirname(out), { recursive: true });

  const args = ["-i", t.diskPath, "-o", out, "--pixels-per-second", String(cfg.pixelsPerSecond), "-b", String(cfg.bits), "-z", "auto"];
  if (cfg.fmt === "dat") args.push("--format", "dat");
  if (cfg.fft && cfg.fft > 0) args.push("--fft-size", String(cfg.fft));

  try {
    await exec("audiowaveform", args, { maxBuffer: 1024 * 1024 * 32 });
    return out;
  } catch (e: any) {
    // write an error sentinel near the output for visibility
    try { writeFileSync(out + ".error.txt", String(e?.stderr || e?.message || e)); } catch {}
    if (!cfg.silenceErrors) throw e;
    return null;
  }
}

/** Run with a worker pool */
export async function processMany(list: PeaksTarget[], opts: PeaksOpts = {}): Promise<{ ok: number; fail: number; skipped: number; }> {
  const cfg = { ...DEFAULTS, ...opts };
  const q = list.slice();
  let ok = 0, fail = 0, skipped = 0;

  const worker = async () => {
    while (q.length) {
      const t = q.shift()!;
      const out = outPathFor(t.uri, cfg);
      if (!out) { skipped++; continue; }
      if (existsSync(out)) { skipped++; continue; }
      const res = await processOne(t, cfg);
      if (res) ok++; else fail++;
    }
  };

  const workers = Array.from({ length: Math.max(1, cfg.concurrency) }, worker);
  await Promise.all(workers);
  return { ok, fail, skipped };
}
