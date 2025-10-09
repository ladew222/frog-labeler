// src/lib/peaksStats.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// Use same env/default pattern as elsewhere
export const CACHE_DIR =
  (process.env.CACHE_DIR || "").trim() || join(process.cwd(), ".cache");

// Your core stats type (kept), plus we’ll attach aliases when we read it
export type PeakStats = {
  version: 1;
  samplesPerPixel: number;
  length: number;          // number of points
  durationS: number;       // seconds (derived)
  mean: number;            // 0..255
  p95: number;             // 0..255
  max: number;             // 0..255
  activeRatio: number;     // 0..1 (fraction of time above threshold)
  activeSeconds: number;   // seconds of “activity”
  threshold: number;       // the threshold used
  score: number;           // 0..100 for UI
};

// Paths map /audio/.../name.wav  ->  <CACHE_DIR>/peaks/.../name.peaks.json|.stats.json
export function peaksPathForUri(cacheDir: string, uri: string) {
  const rel = uri.replace(/^\/audio\//, "").replace(/\.wav$/i, "");
  return join(cacheDir, "peaks", `${rel}.peaks.json`);
}

export function statsPathForUri(cacheDir: string, uri: string) {
  const rel = uri.replace(/^\/audio\//, "").replace(/\.wav$/i, "");
  return join(cacheDir, "peaks", `${rel}.stats.json`);
}

/**
 * Compute cheap "activity" stats from an 8-bit audiowaveform JSON.
 * If p95 ≥ 3, we treat that as “likely non-silence” even on very quiet files.
 */
export function computePeakStatsFromJson(peaksJson: any): PeakStats {
  const spp = Number(peaksJson.samples_per_pixel ?? peaksJson.samplesPerPixel ?? 0);
  const sr  = Number(peaksJson.sample_rate ?? peaksJson.sampleRate ?? 0);
  const data: number[] = Array.isArray(peaksJson.data) ? peaksJson.data : [];

  const len = data.length;
  const durationS = sr && spp ? (len * spp) / sr : 0;

  // 8-bit values 0..255 → fast histogram
  const hist = new Uint32Array(256);
  let sum = 0, mx = 0;
  for (const v0 of data) {
    const v = Math.max(0, Math.min(255, v0 | 0));
    hist[v]++; sum += v; if (v > mx) mx = v;
  }
  const mean = len ? sum / len : 0;

  // percentile 95 from histogram
  const target = Math.ceil(len * 0.95);
  let acc = 0, p95 = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) { p95 = i; break; } }

  // adaptive threshold (keeps false positives low on quiet files)
  const threshold = Math.max(3, Math.round(Math.max(10, p95 - 5))); // “3” is absolute floor
  let activeCount = 0;
  for (const v of data) if ((v | 0) >= threshold) activeCount++;

  const activeRatio = len ? activeCount / len : 0;
  const activeSeconds = durationS * activeRatio;

  // A simple 0..100 score to sort/paint
  const score = Math.round(
    Math.min(100, (activeRatio * 100) * (p95 / 64 + mx / 128))
  );

  return {
    version: 1,
    samplesPerPixel: spp,
    length: len,
    durationS,
    mean,
    p95,
    max: mx,
    activeRatio,
    activeSeconds,
    threshold,
    score,
  };
}

/** Read a peaks JSON file and return stats */
export function computePeakStatsFromFile(peaksPath: string): PeakStats {
  const txt = readFileSync(peaksPath, "utf8");
  const json = JSON.parse(txt);
  return computePeakStatsFromJson(json);
}

/** Write stats JSON next to peaks */
export function writeStatsFile(statsPath: string, stats: PeakStats) {
  mkdirSync(dirname(statsPath), { recursive: true });
  writeFileSync(statsPath, JSON.stringify(stats));
}

/** Convenience: compute & write if missing, return stats or null if no peaks */
export function ensureStatsForPeaks(peaksPath: string, statsPath: string): PeakStats | null {
  if (!existsSync(peaksPath)) return null;
  const stats = computePeakStatsFromFile(peaksPath);
  writeStatsFile(statsPath, stats);
  return stats;
}

/**
 * 👇 Adapter the homepage uses:
 * - Looks up the stats file for the given /audio/... uri
 * - If missing but peaks exist, computes & writes stats
 * - Returns stats plus aliases:
 *   - activity_pct (0..100)
 *   - likely_sound (boolean)
 */
export function readActivityStatsForUri(
  uri: string,
): (PeakStats & { activity_pct: number; likely_sound: boolean }) | null {
  const peaksPath = peaksPathForUri(CACHE_DIR, uri);
  const statsPath = statsPathForUri(CACHE_DIR, uri);

  let stats: PeakStats | null = null;

  if (existsSync(statsPath)) {
    try {
      const txt = readFileSync(statsPath, "utf8");
      stats = JSON.parse(txt) as PeakStats;
    } catch {
      // fall through to recompute from peaks if parsing failed
      stats = null;
    }
  }

  if (!stats && existsSync(peaksPath)) {
    try {
      stats = computePeakStatsFromFile(peaksPath);
      writeStatsFile(statsPath, stats);
    } catch {
      stats = null;
    }
  }

  if (!stats) return null;

  // Heuristic for “likely sound”: any substantive activity or p95 >= 3
  const activity_pct = (stats.activeRatio || 0) * 100;
  const likely_sound = activity_pct >= 0.5 || (stats.p95 ?? 0) >= 3;

  return { ...stats, activity_pct, likely_sound };
}
