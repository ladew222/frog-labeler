// scripts/precompute-peaks.ts
import { db } from "@/lib/db";
import { mapUriToDisk } from "@/lib/audioPath";
import { execFile } from "child_process";
import { promisify } from "util";
import { join, basename } from "path";
import { existsSync, mkdirSync } from "fs";

const exec = promisify(execFile);
const CACHE = process.env.CACHE_DIR || ".cache";

(async () => {
  mkdirSync(join(CACHE, "peaks"), { recursive: true });
  const rows = await db.audioFile.findMany({ select: { uri: true } });
  for (const r of rows) {
    if (!r.uri?.startsWith("/audio/")) continue;
    const disk = mapUriToDisk(r.uri);
    if (!disk) continue;
    const name = basename(disk).replace(/\.wav$/i, "");
    const out = join(CACHE, "peaks", `${name}.peaks.json`);
    if (existsSync(out)) continue;

    try {
      await exec("audiowaveform", ["-i", disk, "-o", out, "--pixels-per-second", "50", "-b", "8", "-z", "auto"]);
      console.log("peaks ok:", out);
    } catch (e) {
      console.error("peaks fail:", disk, e);
    }
  }
  process.exit(0);
})();
