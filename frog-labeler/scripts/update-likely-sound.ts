// scripts/update-likely-sound.ts
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

/**
 * Reads all .stats.json files from CACHE_DIR (default /var/cache/frog-peaks)
 * and updates AudioFile.likelySound + lastScannedAt.
 *
 * Run with:
 *    pnpm tsx scripts/update-likely-sound.ts
 */

const CACHE_DIR = process.env.CACHE_DIR || "/var/cache/frog-peaks";

function getAllStatsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...getAllStatsFiles(full));
    else if (entry.isFile() && entry.endsWith(".stats.json")) files.push(full);
  }
  return files;
}

(async () => {
  if (!fs.existsSync(CACHE_DIR)) {
    console.error(`❌ CACHE_DIR not found: ${CACHE_DIR}`);
    process.exit(1);
  }

  const statsFiles = getAllStatsFiles(CACHE_DIR);
  if (statsFiles.length === 0) {
    console.log("⚠️  No .stats.json files found in cache.");
    process.exit(0);
  }

  console.log(`Found ${statsFiles.length} stats files in ${CACHE_DIR}`);

  let updated = 0;
  for (const file of statsFiles) {
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      // Adjust this line based on what your stats actually contain:
      const score = json.likelySound ?? json.rms ?? json.mean ?? null;
      if (score == null) continue;

      const filename = path.basename(file).replace(".stats.json", ".wav");

      await db.audioFile.updateMany({
        where: { originalName: filename },
        data: {
          likelySound: typeof score === "number" ? score * 100 : null,
          lastScannedAt: new Date(),
        },
      });
      updated++;
    } catch (err) {
      console.error("❌ failed for", file, err);
    }
  }

  console.log(`✅ Updated likelySound for ${updated} audio files`);
  process.exit(0);
})();
