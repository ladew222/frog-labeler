// tools/precompute-peaks.ts
import "dotenv/config";
import { db } from "@/lib/db";
import { processMany, CACHE_DIR, type PeakOptions } from "@/lib/peaks";

type Flags = {
  db: boolean;
  concurrency: number;
  pps: number;
  bits: 8 | 16;
  fmt: "json" | "dat";
};

function parseFlags(): Flags {
  const argv = process.argv.slice(2);
  const f: Flags = {
    db: argv.includes("--db"),
    concurrency: Number(argv[argv.indexOf("--concurrency") + 1] || 4) as number,
    pps: Number(argv[argv.indexOf("--pps") + 1] || 50),
    bits: Number(argv[argv.indexOf("--bits") + 1] || 8) as 8 | 16,
    fmt: (argv[argv.indexOf("--fmt") + 1] || "json") as "json" | "dat",
  };
  return f;
}

(async () => {
  const flags = parseFlags();

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

  const res = await processMany(uris, {
    concurrency: flags.concurrency,
    pps: flags.pps,
    bits: flags.bits,
    fmt: flags.fmt,
  } as PeakOptions);

  console.log("Done:", res);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
