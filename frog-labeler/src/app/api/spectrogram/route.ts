import { NextResponse } from "next/server";
import { mkdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { createHash } from "crypto";

const AUDIO_ROOT = process.env.AUDIO_ROOT || "/Volumes/frog/Data";
const SPECTRO_ROOT = process.env.SPECTRO_ROOT || "/Volumes/frog/frog-spectrograms";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function safeJoin(root: string, rel: string) {
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(path.normalize(root))) {
    throw new Error("Invalid path");
  }
  return p;
}

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

// ---------------------------------------------------------------------------
// route
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uri = searchParams.get("uri");
    if (!uri) {
      return NextResponse.json({ error: "Missing uri" }, { status: 400 });
    }

    const pxPerSec = Math.max(
      60,
      Math.min(300, Number(searchParams.get("pxPerSec")) || 120)
    );
    const height = Math.max(
      160,
      Math.min(1024, Number(searchParams.get("height")) || 480)
    );
    const forceRegen = searchParams.get("regen") === "1";

    const relativePath = decodeURIComponent(uri).replace(/^\/?audio\//, "");
    const wavPath = safeJoin(AUDIO_ROOT, relativePath);
    const outPng = safeJoin(SPECTRO_ROOT, relativePath + ".png");
    const rawPng = outPng.replace(/\.png$/, ".raw.png");

    if (!existsSync(wavPath)) {
      return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    }

    mkdirSync(path.dirname(outPng), { recursive: true });

    // ---- determine width from duration ----
    const duration = ffprobeDurationSeconds(wavPath);
    const width =
      duration > 0 ? Math.round(duration * pxPerSec) : 300 * pxPerSec;
    const finalWidth = Math.min(width, 20000);

    // ---- generate spectrogram if needed ----
    if (forceRegen || !existsSync(outPng)) {
      // 1) FFT-only spectrogram (FFmpeg)
      const cmd1 =
        `ffmpeg -y -hide_banner -loglevel error -i "${wavPath}" ` +
        `-lavfi "showspectrumpic=s=${finalWidth}x${height}:legend=disabled:scale=log" ` +
        `"${rawPng}"`;

      // 2) Contrast normalization (ImageMagick)
      const cmd2 =
        `convert "${rawPng}" ` +
        `-auto-level ` +
        `-gamma 0.85 ` +
        `-contrast-stretch 0.5%x0.5% ` +
        `"${outPng}"`;

      console.log("🛠 ffmpeg:", cmd1);
      execSync(cmd1, { stdio: "inherit" });

      console.log("🎚 normalize:", cmd2);
      execSync(cmd2, { stdio: "inherit" });

      // optional cleanup
      try {
        execSync(`rm -f "${rawPng}"`);
      } catch {}
    }

    // ---- serve with strong caching ----
    const png = readFileSync(outPng);
    const hash = createHash("md5").update(png).digest("hex");
    const etag = `"${hash}"`;

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

    return new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
      },
    });
  } catch (err: any) {
    console.error("❌ Spectrogram error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}
