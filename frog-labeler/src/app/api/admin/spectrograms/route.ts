import { NextResponse } from "next/server";
import { exec } from "child_process";
import { readdirSync, statSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { initFolder, markFileDone, finishFolder } from "@/lib/spectroProgress";

const AUDIO_ROOT = process.env.AUDIO_ROOT || "/Volumes/frog/Data";
const SPECTRO_ROOT = process.env.SPECTRO_ROOT || "/Volumes/frog/frog-spectrograms";

// --- helpers ---------------------------------------------------------------
function safeJoin(root: string, rel: string) {
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(path.normalize(root))) throw new Error("Invalid path");
  return p;
}

function findWavFiles(dir: string, acc: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) findWavFiles(p, acc);
    else if (f.toLowerCase().endsWith(".wav")) acc.push(p);
  }
  return acc;
}

// --- concurrency-safe batch runner -----------------------------------------
async function processBatch(folder: string, paths: string[], concurrency = 8) {
  let index = 0;
  let errors = 0;

  // Initialize progress tracker
  initFolder(folder, paths.length);

  async function worker() {
    while (index < paths.length) {
      const i = index++;
      const wavPath = paths[i];
      const rel = path.relative(AUDIO_ROOT, wavPath);
      const outPng = safeJoin(SPECTRO_ROOT, rel + ".png");
      mkdirSync(path.dirname(outPng), { recursive: true });

      try {
        // Skip if PNG already exists
        if (existsSync(outPng)) {
          markFileDone(folder, rel);
          continue;
        }
        const cmd =
          `ffmpeg -y -hide_banner -loglevel error -i "${wavPath}" ` +
          `-lavfi "` +
          `highpass=f=120,` +
          `showspectrum=s=1920x480:` +
          `mode=combined:` +
          `scale=log:` +
          `drange=45:` +
          `color=gray` +
          `" -frames:v 1 "${outPng}"`;


        await new Promise<void>((resolve) => {
          exec(cmd, (err) => {
            if (err) {
              console.error(`❌ Failed: ${rel} (${err.message})`);
              errors++;
            } else {
              console.log(`🛠 Generated: ${rel}`);
              markFileDone(folder, rel);
            }
            resolve();
          });
        });
      } catch (err: any) {
        console.error(`❌ Exception: ${wavPath}`, err);
        errors++;
      }
    }
  }

  // Run a limited number of concurrent workers
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.allSettled(workers);

  finishFolder(folder);
  console.log(`✅ Completed batch for ${folder} with ${errors} errors`);
}

// --- route handler ----------------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const folder = body.folder;
    if (!folder)
      return NextResponse.json({ error: "Missing folder" }, { status: 400 });

    const absFolder = safeJoin(AUDIO_ROOT, folder);
    const wavs = findWavFiles(absFolder);
    if (wavs.length === 0) {
      return NextResponse.json({ logs: [`No .wav files in ${absFolder}`] });
    }

    console.log(`🟢 Starting batch generation for ${folder} (${wavs.length} files)`);

    // Run in background without blocking the API response
    processBatch(folder, wavs, 8);

    return NextResponse.json({
      message: `Started batch generation for ${folder}`,
      total: wavs.length,
    });
  } catch (err: any) {
    console.error("❌ Spectrogram background error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
