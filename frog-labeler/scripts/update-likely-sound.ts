// scripts/update-likely-sound.ts
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

/**
 * This script updates AudioFile.likelySound and lastScannedAt
 * based on nightly detection output (JSON or CSV).
 * Run via:  pnpm tsx scripts/update-likely-sound.ts
 */

const RESULTS_PATH =
  process.env.SOUND_RESULTS_PATH || "/Volumes/frog/nightly_sound.json";

(async () => {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.error(`❌ Results file not found: ${RESULTS_PATH}`);
    process.exit(1);
  }

  // Example: [{ filename: "INDU04_20150401_230000.wav", score: 0.186 }]
  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));

  let updated = 0;
  for (const { filename, score } of data) {
    const percent =
      typeof score === "number"
        ? score * 100
        : parseFloat(score.toString()) || null;

    await db.audioFile.updateMany({
      where: { originalName: filename },
      data: {
        likelySound: percent,
        lastScannedAt: new Date(),
      },
    });

    updated++;
  }

  console.log(`✅ Updated likelySound for ${updated} files`);
  process.exit(0);
})();
