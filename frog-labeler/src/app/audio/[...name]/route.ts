import { NextResponse } from "next/server";
import { statSync, createReadStream } from "fs";
import { mapUriToDisk, safeJoin } from "@/lib/audioPath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ name: string[] }> }) {
  const { name } = await ctx.params;
  if (!name?.length) return NextResponse.json({ error: "Missing filename" }, { status: 400 });

  // Build the *URI* then map to disk via AUDIO_ROOT
  const uri = "/audio/" + name.map(encodeURIComponent).join("/");
  const filePath = mapUriToDisk(uri);
  if (!filePath) return NextResponse.json({ error: "Forbidden path" }, { status: 403 });

  const stat = statSync(filePath);
  const range = req.headers.get("range");

  // Support byte-range streaming
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = m?.[2] ? parseInt(m[2], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    const stream = createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 });
    return new NextResponse(stream as any, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": filePath.toLowerCase().endsWith(".wav") ? "audio/wav" : "application/octet-stream",
        "Cache-Control": "public, max-age=0",
      },
    });
  }

  // Full file (fallback)
  const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });
  return new NextResponse(stream as any, {
    headers: {
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Type": filePath.toLowerCase().endsWith(".wav") ? "audio/wav" : "application/octet-stream",
      "Cache-Control": "public, max-age=0",
    },
  });
}
