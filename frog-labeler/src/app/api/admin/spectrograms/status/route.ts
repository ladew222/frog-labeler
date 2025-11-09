import { NextResponse } from "next/server";
import { exec } from "child_process";
import { readdirSync, statSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { updateProgress, initFolder, finishFolder } from "@/lib/spectroProgress";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AUDIO_ROOT = process.env.AUDIO_ROOT || "/Volumes/frog/Data";
const SPECTRO_ROOT = process.env.SPECTRO_ROOT || "/Volumes/frog/frog-spectrograms";

// --- Helper: ensure joined paths are safe ---------------------------------
function safeJoin(root: string, rel: string) {
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(path.normalize(root))) throw new Error("Invalid path");
  return p;
}

// --- Helper: recursively find .wav files ----------------------------------
function findWavFiles(dir: string, acc: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) findWavFiles(p, acc);
    else if (f.toLowerCase().endsWith(".wav")) acc.push(p);
  }
  return acc;
}

// --- Background batch processor ------------------------------------------
async function processBatch(folder: string, wavPaths: string[], concurrency = 8) {
  console.log(`🟢 Starting batch for ${folder} (${wavPaths.length} files)`);

  let index = 0;
  let done = 0;
  let errors = 0;

  initFolder(folder, wavPaths.length);

  async function worker() {
    while (index < wavPaths.length) {
      const i = index++;
      const wavPath = wavPaths[i];
      const rel = path.relative(AUDIO_ROOT, wavPath);
      const outPng = safeJoin(SPECTRO_ROOT, rel + ".png");
      mkdirSync(path.dirname(outPng), { recursive: true });

      try {
        if (existsSync(outPng)) {
          done++;
          updateProgress(folder, { done });
          continue;
        }

        const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${wavPath}" -lavfi "showspectrumpic=s=1920x480:legend=disabled:color=intensity:scale=log" "${outPng}"`;
        await new Promise<void>((resolve) => {
          exec(cmd, (err) => {
            if (err) {
              console.error(`❌ Failed: ${rel} (${err.message})`);
              errors++;
            } else {
              console.log(`🛠 Generated: ${rel}`);
            }
            done++;
            updateProgress(folder, { done, errors });
            resolve();
          });
        });
      } catch (err: any) {
        console.error(`❌ Exception: ${wavPath}`, err);
        errors++;
        done++;
        updateProgress(folder, { done, errors });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.allSettled(workers);

  finishFolder(folder);
  console.log(`✅ Completed batch for ${folder}`);
}

// --- Route handler --------------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const folder = body.folder;
    if (!folder) {
      return NextResponse.json({ error: "Missing folder" }, { status: 400 });
    }

    const absFolder = safeJoin(AUDIO_ROOT, folder);
    const wavs = findWavFiles(absFolder);
    if (wavs.length === 0) {
      return NextResponse.json({ logs: [`No .wav files found in ${absFolder}`] });
    }

    // Run batch in background
    processBatch(folder, wavs, 8);

    return NextResponse.json({
      message: `Started batch generation for ${folder}`,
      total: wavs.length,
    });
  } catch (err: any) {
    console.error("❌ Spectrogram batch error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
