// tools/precompute-peaks.ts
import "dotenv/config";

import { existsSync } from "fs";
import { db } from "@/lib/db";
import { processMany, CACHE_DIR, type PeakOptions } from "@/lib/peaks";
import {
  computePeakStatsFromFile,
  peaksPathForUri,
  statsPathForUri,
  writeStatsFile,
} from "@/lib/peakStats";

type Flags = {
  db: boolean;
  concurrency: number;
  pps: number;
  bits: 8 | 16;
  fmt: "json" | "dat";
};

function parseFlags(): Flags {
  const argv = process.argv.slice(2);
  const get = (flag: string, def: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  return {
    db: argv.includes("--db"),
    concurrency: Number(get("--concurrency", "4")),
    pps: Number(get("--pps", "50")),
    bits: Number(get("--bits", "8")) as 8 | 16,
    fmt: (get("--fmt", "json") as "json" | "dat"),
  };
}

(async () => {
  const flags = parseFlags();

  // ---- gather URIs ----
  let uris: string[] = [];
  if (flags.db) {
    const rows = await db.audioFile.findMany({ select: { uri: true } });
    uris = rows.map((r) => r.uri).filter((u): u is string => !!u && u.startsWith("/audio/"));
  } else {
    console.error("No inputs provided. Use --db or add your own source of URIs.");
    process.exit(1);
  }

  console.log(
    `Targets: ${uris.length} file(s), mode=${flags.db ? "db" : "custom"}, cacheDir=${CACHE_DIR}`
  );

  // ---- generate PEAKS first ----
  const res = await processMany(uris, {
    concurrency: flags.concurrency,
    pps: flags.pps,
    bits: flags.bits,
    fmt: flags.fmt,
  } as PeakOptions);

  console.log("Peaks summary:", res);

  // ---- second pass: compute STATS for any existing peaks ----
  let statsOk = 0, statsSkip = 0, statsFail = 0;
  for (const uri of uris) {
    try {
      const peaksPath = peaksPathForUri(CACHE_DIR, uri);
      const statsPath = statsPathForUri(CACHE_DIR, uri);
      if (!existsSync(peaksPath)) { statsSkip++; continue; }
      const stats = computePeakStatsFromFile(peaksPath);
      writeStatsFile(statsPath, stats);
      statsOk++;
    } catch (e) {
      statsFail++;
      console.error("stats failed:", uri, e);
    }
  }

  console.log(`Stats summary: ok=${statsOk}, skip=${statsSkip}, fail=${statsFail}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
