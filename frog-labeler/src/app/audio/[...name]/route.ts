import { NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import { join, normalize, isAbsolute } from "path";

const BASE_DIR =
  process.env.AUDIO_ROOT || join(process.cwd(), "public", "audio");

// Simple, safe join: blocks path traversal
function safeJoin(base: string, parts: string[]) {
  const rel = normalize(parts.join("/"));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return join(base, rel);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string[] }> } // 👈 awaitable params
) {
  const { name } = await ctx.params;           // 👈 await it

  if (!name?.length) {
    return new NextResponse(JSON.stringify({ error: "Missing filename" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const filePath = safeJoin(BASE_DIR, name);   // use awaited value
  if (!filePath) {
    return new NextResponse(JSON.stringify({ error: "Forbidden path" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Support simple streaming (add Range support later if needed)
  const stat = statSync(filePath);
  const stream = createReadStream(filePath);

  return new NextResponse(stream as any, {
    headers: {
      "Content-Length": String(stat.size),
      // If you may serve more than WAV, sniff by extension:
      "Content-Type": filePath.toLowerCase().endsWith(".wav")
        ? "audio/wav"
        : "application/octet-stream",
      "Accept-Ranges": "bytes",
    },
  });
}
