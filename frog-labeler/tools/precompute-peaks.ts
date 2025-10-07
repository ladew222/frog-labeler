// tools/precompute-peaks.ts
/* eslint-disable no-console */
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { AUDIO_ROOT, mapUriToDisk } from "@/lib/audioPath";
import { processMany } from "@/lib/peaks";

type Mode = "db" | "walk";

function parseArgs() {
  const a = process.argv.slice(2);
  const out: any = { mode: "db" as Mode, concurrency: 2, fmt: "json", pps: 50, bits: 8, root: AUDIO_ROOT };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    const v = a[i + 1];
    if (k === "--walk") { out.mode = "walk"; }
    else if (k === "--db") { out.mode = "db"; }
    else if (k === "--root") { out.root = v; i++; }
    else if (k === "--concurrency") { out.concurrency = Number(v); i++; }
    else if (k === "--fmt") { out.fmt = v; i++; }
    else if (k === "--pps") { out.pps = Number(v); i++; }
    else if (k === "--bits") { out.bits = Number(v); i++; }
  }
  return out;
}

function walkWavs(root: string): { uri: string; diskPath: string }[] {
  const out: { uri: string; diskPath: string }[] = [];
  const rec = (dir: string, rel = "") => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = statSync(abs);
      const relPath = rel ? `${rel}/${name}` : name;
      if (st.isDirectory()) rec(abs, relPath);
      else if (/\.wav$/i.test(name)) {
        out.push({ uri: `/audio/${relPath}`, diskPath: abs });
      }
    }
  };
  rec(root);
  return out;
}

(async () => {
  const args = parseArgs();
  let targets: { uri: string; diskPath: string }[] = [];

  if (args.mode === "db") {
    const rows = await db.audioFile.findMany({ select: { uri: true } });
    targets = rows
      .filter(r => r.uri?.startsWith("/audio/"))
      .map(r => ({ uri: r.uri!, diskPath: mapUriToDisk(r.uri!) }))
      .filter(t => !!t.diskPath) as any[];
  } else {
    targets = walkWavs(args.root);
  }

  console.log(`Targets: ${targets.length} file(s), mode=${args.mode}, root=${args.root}`);

  const res = await processMany(targets, {
    concurrency: args.concurrency,
    fmt: args.fmt,
    pixelsPerSecond: args.pps,
    bits: args.bits,
  });

  console.log("Done:", res);
  process.exit(res.fail > 0 ? 1 : 0);
})();
