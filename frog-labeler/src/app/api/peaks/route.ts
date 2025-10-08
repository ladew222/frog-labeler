// src/app/api/peaks/route.ts
import { NextResponse } from "next/server";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { mapUriToDisk, relativeFromAudioRoot } from "@/lib/audioPath";

// Respect service env (systemd loads .env.production)
const CACHE_DIR = (process.env.CACHE_DIR || "/var/cache/frog-peaks").trim();
const BIN = (process.env.AUDIOWAVEFORM_BIN || "audiowaveform").trim();

// Build the cache path for a given /audio/... uri
function cachePathsFor(uri: string) {
  const rel = relativeFromAudioRoot(uri); // e.g. INDU08_GreatMarsh/2015/INDU08_20150318_150000.wav
  if (!rel) return null;
  const base = rel.replace(/\.wav$/i, "");
  const dir = join(CACHE_DIR, "peaks", dirname(rel));
  const json = join(CACHE_DIR, "peaks", `${base}.peaks.json`);
  const dat  = join(CACHE_DIR, "peaks", `${base}.peaks.dat`);
  return { dir, json, dat };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uri = url.searchParams.get("uri") || "";
  if (!uri.startsWith("/audio/")) {
    return NextResponse.json({ error: "bad uri" }, { status: 400 });
  }

  const disk = mapUriToDisk(uri);
  if (!disk) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const paths = cachePathsFor(uri);
  if (!paths) return NextResponse.json({ error: "map error" }, { status: 500 });

  // If cached, return it (prefer JSON if present)
  if (existsSync(paths.json)) {
    const buf = readFileSync(paths.json);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }
  if (existsSync(paths.dat)) {
    const buf = readFileSync(paths.dat);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Ensure directory exists
  mkdirSync(paths.dir, { recursive: true });

  // Kick off background generation.
  // IMPORTANT for v1.10.x:
  // - Do NOT pass --format (extension chooses)
  // - Use EITHER --pixels-per-second OR -z auto (not both)
  const args = [
    "-i", disk,
    "-o", paths.json,          // write JSON because of .json extension
    "--pixels-per-second", "50",
    "-b", "8",
    // no "-z auto" here because PPS is set
  ];

  try {
    spawn(BIN, args, { stdio: "ignore", detached: true }).unref();
  } catch (e) {
    console.error("spawn audiowaveform failed:", e);
    return NextResponse.json({ error: "spawn failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "building" }, { status: 202 });
}
