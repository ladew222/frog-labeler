export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

type Ctx = { params: Promise<{ name: string[] }> };

function jsonErr(msg: string, code = 400) {
  return new NextResponse(JSON.stringify({ error: msg }), {
    status: code,
    headers: { "Content-Type": "application/json" },
  });
}

// Safe join that blocks traversal (.., absolute paths, etc.)
function safeJoin(base: string, parts: string[]) {
  const decoded = parts.map((s) => decodeURIComponent(s));
  const joined = path.join(base, ...decoded);
  const normBase = path.resolve(base) + path.sep;
  const normJoined = path.resolve(joined);
  if (!normJoined.startsWith(normBase)) return null;
  return normJoined;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { name } = await ctx.params; // Next 15: await params
  if (!name?.length) return jsonErr("Missing filename", 400);

  // IMPORTANT: read env at request time (prevents “baked-in” /Volumes paths)
  const BASE_DIR =
    process.env.AUDIO_ROOT ||
    process.env.AUDIO_DIR ||
    path.join(process.cwd(), "public", "audio");

  const filePath = safeJoin(BASE_DIR, name);
  if (!filePath) return jsonErr("Forbidden path", 403);

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return jsonErr(`Not found: ${filePath}`, 404);
  }

  const stream = createReadStream(filePath);
  return new NextResponse(stream as any, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": filePath.toLowerCase().endsWith(".wav")
        ? "audio/wav"
        : "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
