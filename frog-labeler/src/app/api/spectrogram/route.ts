// app/api/spectrogram/route.ts
import { NextResponse } from "next/server";
import { mkdirSync, readFileSync, existsSync, statSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { createHash } from "crypto";

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
    const uri = searchParams.get("uri");
    if (!uri) {
      return NextResponse.json({ error: "Missing uri" }, { status: 400 });
    }

    const pxPerSec = Math.max(60, Math.min(300, Number(searchParams.get("pxPerSec")) || 120));
    const height = Math.max(160, Math.min(1024, Number(searchParams.get("height")) || 480));
    const forceRegen = searchParams.get("regen") === "1";

    const relativePath = decodeURIComponent(uri).replace(/^\/?audio\//, "");
    const wavPath = safeJoin(AUDIO_ROOT, relativePath);
    const outPng = safeJoin(SPECTRO_ROOT, relativePath + ".png");

    if (!existsSync(wavPath)) {
      return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    }

    mkdirSync(path.dirname(outPng), { recursive: true });

    // --- Determine spectrogram width ---
    const duration = ffprobeDurationSeconds(wavPath) || 0;
    const width = duration > 0 ? Math.round(duration * pxPerSec) : 300 * pxPerSec;
    const maxWidth = 20000;
    const finalWidth = Math.min(width, maxWidth);

    // --- Generate only if missing or forced ---
    if (forceRegen || !existsSync(outPng)) {
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





      console.log("🛠 ffmpeg:", cmd);
      execSync(cmd, { stdio: "inherit" });
    }

    // --- Read PNG and compute hash for ETag ---
    const png = readFileSync(outPng);
    const hash = createHash("md5").update(png).digest("hex");
    const etag = `"${hash}"`;

    // --- Check client’s If-None-Match for instant 304 response ---
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          ETag: etag,
        },
      });
    }

    // --- Serve PNG with long-term caching ---
    const res = new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
      },
    });

    console.log(`✅ Serving ${forceRegen ? "regenerated" : "cached"} spectrogram:`, outPng);
    return res;
  } catch (err: any) {
    console.error("❌ Spectrogram generation error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
