// scripts/precompute-peaks.ts
import { db } from "@/lib/db";
import { mapUriToDisk } from "@/lib/audioPath";
import { processMany } from "@/lib/peaks";

(async () => {
  const rows = await db.audioFile.findMany({ select: { uri: true } });
  const targets = rows
    .filter(r => r.uri?.startsWith("/audio/"))
    .map(r => ({ uri: r.uri!, diskPath: mapUriToDisk(r.uri!) }))
    .filter(t => !!t.diskPath) as { uri: string; diskPath: string }[];

  const res = await processMany(targets, {
    concurrency: Number(process.env.PEAKS_CONCURRENCY || 2),
    pixelsPerSecond: Number(process.env.PEAKS_PPS || 50),
    bits: Number(process.env.PEAKS_BITS || 8) as 8|16,
    fmt: (process.env.PEAKS_FMT as any) || "json",
  });

  console.log("peaks:", res);
  process.exit(0);
})();
