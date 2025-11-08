// app/api/spectrogram/route.ts
import { NextResponse } from "next/server";
import { mkdirSync, readFileSync, existsSync, statSync } from "fs";
import path from "path";
import { execSync } from "child_process";

const AUDIO_ROOT = process.env.AUDIO_ROOT || "/Volumes/frog/Data";
const SPECTRO_ROOT = process.env.SPECTRO_ROOT || "/Volumes/frog/frog-spectrograms";

// --- helpers ---------------------------------------------------------------

function ffprobeDurationSeconds(wavPath: string): number {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${wavPath}"`
    )
      .toString()
      .trim();
    const s = parseFloat(out);
    return Number.isFinite(s) ? s : 0;
  } catch {
    return 0;
  }
}

function safeJoin(root: string, rel: string) {
  // Disallow path traversal
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(path.normalize(root))) {
    throw new Error("Invalid path");
  }
  return p;
}

// --- route ----------------------------------------------------------------

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    // required: uri=/audio/…wav
    const uri = searchParams.get("uri");
    if (!uri) {
      return NextResponse.json({ error: "Missing uri" }, { status: 400 });
    }

    // optional tuning (sane defaults)
    const pxPerSec = Math.max(
      60,
      Math.min(300, Number(searchParams.get("pxPerSec")) || 120)
    ); // native width detail
    const height = Math.max(
      160,
      Math.min(1024, Number(searchParams.get("height")) || 480)
    );
    const forceRegen = searchParams.get("regen") === "1";

    // map /audio/... → disk
    const relativePath = decodeURIComponent(uri).replace(/^\/?audio\//, "");
    const wavPath = safeJoin(AUDIO_ROOT, relativePath);
    const outPng = safeJoin(SPECTRO_ROOT, relativePath + ".png");

    // quick existence check for the source file
    try {
      statSync(wavPath);
    } catch {
      return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    }

    mkdirSync(path.dirname(outPng), { recursive: true });

    // decide output width from duration
    const duration = ffprobeDurationSeconds(wavPath) || 0;
    const width =
      duration > 0
        ? Math.round(duration * pxPerSec)
        : 300 * pxPerSec; // fallback if duration unknown

    // cap to keep latency/file-size reasonable (adjust to taste)
    const maxWidth = 20000; // ~166s @ 120 px/s; longer files still draw, just capped
    const finalWidth = Math.min(width, maxWidth);

    // (re)generate only if needed or forced
    if (forceRegen || !existsSync(outPng)) {
      // showspectrumpic = single image containing the whole file timeline
      // - legend disabled for clean UI
      // - scale=log for perceptual loudness
      // - color=intensity for viridis-like map
      const cmd = `ffmpeg -y -hide_banner -loglevel error -i "${wavPath}" -lavfi ` +
        `"showspectrumpic=s=${finalWidth}x${height}:legend=disabled:color=intensity:scale=log" ` +
        `"${outPng}"`;
      console.log("🛠 ffmpeg:", cmd);
      execSync(cmd, { stdio: "inherit" });
    }

    const png = readFileSync(outPng);
    // allow browser/proxy caching (client already cache-busts via &t=…)
    const res = new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    return res;
  } catch (err: any) {
    console.error("❌ Spectrogram generation error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}
