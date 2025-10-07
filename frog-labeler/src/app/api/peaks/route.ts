import { NextResponse } from "next/server";
import { existsSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { mapUriToDisk } from "@/lib/audioPath";

const CACHE = process.env.CACHE_DIR || join(process.cwd(), ".cache");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uri = url.searchParams.get("uri") || "";
  if (!uri.startsWith("/audio/")) {
    return NextResponse.json({ error: "bad uri" }, { status: 400 });
  }

  const diskPath = mapUriToDisk(uri);
  if (!diskPath) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const name = uri.split("/").pop()!.replace(/\.wav$/i, "");
  const peaksPath = join(CACHE, "peaks", `${name}.peaks.json`);

  // Serve if cached
  if (existsSync(peaksPath)) {
    return new NextResponse(Bun.file ? Bun.file(peaksPath) : (await import("fs")).createReadStream(peaksPath) as any, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Ensure dir
  mkdirSync(dirname(peaksPath), { recursive: true });

  // Fire-and-forget generation (requires `audiowaveform` installed)
  const args = [
    "-i", diskPath,
    "-o", peaksPath,
    "--pixels-per-second", "50",
    "-b", "8",
    "-z", "auto"
  ];
  spawn("audiowaveform", args, { stdio: "ignore", detached: true }).unref();

  return NextResponse.json({ status: "building" }, { status: 202 });
}
