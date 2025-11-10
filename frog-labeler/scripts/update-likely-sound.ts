// scripts/update-likely-sound.ts
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

const CACHE_DIR = process.env.CACHE_DIR || "/var/cache/frog-peaks";

(async () => {
  const files = fs.readdirSync(CACHE_DIR, { recursive: true })
    .filter(f => f.endsWith(".stats.json"))
    .map(f => path.join(CACHE_DIR, f));

  let updated = 0;

  for (const file of files) {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const filename = path.basename(file).replace(".stats.json", ".wav");
    const score = json.likelySound ?? json.rms ?? null;

    await db.audioFile.updateMany({
      where: { originalName: filename },
      data: { likelySound: score ? score * 100 : null, lastScannedAt: new Date() },
    });
    updated++;
  }

  console.log(`✅ Updated likelySound for ${updated} files`);
  process.exit(0);
})();
