import { NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import { join, normalize, isAbsolute } from "path";

export const runtime = "nodejs"; // force dynamic

function safeJoin(base: string, parts: string[]) {
  const rel = normalize(parts.join("/"));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return join(base, rel);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string[] }> } // 👈 awaitable in Next.js 15
) {
  const { name } = await ctx.params;
  const BASE_DIR = process.env.AUDIO_ROOT || "public/audio";

  if (!name?.length) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  const filePath = safeJoin(BASE_DIR, name);
  if (!filePath) {
    return NextResponse.json({ error: "Forbidden path" }, { status: 403 });
  }

  try {
    const stat = statSync(filePath);
    const stream = createReadStream(filePath);
    return new NextResponse(stream as any, {
      headers: {
        "Content-Length": String(stat.size),
        "Content-Type": filePath.toLowerCase().endsWith(".wav")
          ? "audio/wav"
          : "application/octet-stream",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Not found: ${filePath}` }, { status: 404 });
  }
}
