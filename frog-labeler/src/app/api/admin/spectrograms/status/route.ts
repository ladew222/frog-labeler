import { NextResponse } from "next/server";
import { readdirSync, statSync, existsSync } from "fs";
import path from "path";

const AUDIO_ROOT = process.env.AUDIO_ROOT || "/Volumes/frog/Data";
const SPECTRO_ROOT = process.env.SPECTRO_ROOT || "/Volumes/frog/frog-spectrograms";

// recursively count .wav files
function findWavFiles(dir: string, acc: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) findWavFiles(p, acc);
    else if (f.toLowerCase().endsWith(".wav")) acc.push(p);
  }
  return acc;
}

// recursively count .png files (same structure)
function findPngFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) findPngFiles(p, acc);
    else if (f.toLowerCase().endsWith(".png")) acc.push(p);
  }
  return acc;
}

export async function GET() {
  try {
    // list top-level folders under AUDIO_ROOT
    const topFolders = readdirSync(AUDIO_ROOT)
      .filter((f) => statSync(path.join(AUDIO_ROOT, f)).isDirectory());

    const progress: Record<
      string,
      { total: number; done: number; finished: boolean; errors: number }
    > = {};

    for (const folder of topFolders) {
      const wavs = findWavFiles(path.join(AUDIO_ROOT, folder));
      const pngs = findPngFiles(path.join(SPECTRO_ROOT, folder));
      const total = wavs.length;
      const done = pngs.length;
      const finished = total > 0 && done >= total;
      progress[folder] = { total, done, finished, errors: 0 };
    }

    return NextResponse.json(progress);
  } catch (err: any) {
    console.error("❌ Progress check failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
