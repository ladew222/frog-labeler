// src/app/api/peaks/route.ts
import { NextResponse } from "next/server";
import { existsSync, mkdirSync, createReadStream } from "fs";
import { join, dirname } from "path";
import { spawn } from "child_process";
import { mapUriToDisk } from "@/lib/audioPath";

const CACHE = (process.env.CACHE_DIR || "").trim() || join(process.cwd(), ".cache");
const BIN = (process.env.AUDIOWAVEFORM_BIN || "").trim() || "audiowaveform";

// Build peaks path using the same nested structure as /audio/...
function peaksPathForUri(uri: string) {
  const rel = uri.replace(/^\/audio\//, "").replace(/\.wav$/i, "");
  return join(CACHE, "peaks", `${rel}.peaks.json`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uri = url.searchParams.get("uri") || "";
  if (!uri.startsWith("/audio/")) {
    return NextResponse.json({ error: "bad uri" }, { status: 400 });
  }

  const diskPath = mapUriToDisk(uri);
  if (!diskPath) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const out = peaksPathForUri(uri);

  // If cached, stream it
  if (existsSync(out)) {
    const stream = createReadStream(out);
    return new NextResponse(stream as any, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Ensure dir and kick off background generation
  mkdirSync(dirname(out), { recursive: true });

  // IMPORTANT for v1.10.x: don't use both --pixels-per-second and -z
  const args = ["-i", diskPath, "-o", out, "--pixels-per-second", "50", "-b", "8"];
  try {
    const child = spawn(BIN, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    // If spawn fails, still return 202; logs will show the error
  }

  // Helpful for debugging: tells you exactly where it’s writing
  return NextResponse.json({ status: "building", cacheDir: CACHE, out }, { status: 202 });
}
