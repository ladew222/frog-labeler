import { NextResponse } from "next/server";
import fs from "node:fs";
import { join, normalize, isAbsolute } from "node:path";

export const runtime = "nodejs"; // keep Node for fs access

function safeJoin(base: string, parts: string[]) {
  const rel = normalize(parts.join("/"));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return join(base, rel);
}

async function statFile(filePath: string) {
  return fs.promises.stat(filePath);
}

function contentTypeFor(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string[] }> } // Next 15: awaitable
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
    const stat = await statFile(filePath);
    const size = stat.size;
    const ctype = contentTypeFor(filePath);

    // Caching/validation
    const lastModified = stat.mtime.toUTCString();
    const etag = `"${size}-${Number(stat.mtime)}"`;

    // Conditional GET (If-None-Match / If-Modified-Since)
    const ifNoneMatch = req.headers.get("if-none-match");
    const ifModifiedSince = req.headers.get("if-modified-since");
    if (ifNoneMatch === etag || (ifModifiedSince && new Date(ifModifiedSince) >= stat.mtime)) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "ETag": etag,
          "Last-Modified": lastModified,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Accept-Ranges": "bytes",
          "Content-Type": ctype,
        },
      });
    }

    // Range support
    const range = req.headers.get("range");
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (!m) {
        return NextResponse.json({ error: "Bad Range" }, { status: 400 });
      }
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : size - 1;

      // Normalize
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start > end || start >= size) {
        // 416 Range Not Satisfiable
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${size}`,
            "Accept-Ranges": "bytes",
            "ETag": etag,
            "Last-Modified": lastModified,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }

      const chunk = fs.createReadStream(filePath, { start, end });
      return new NextResponse(chunk as any, {
        status: 206,
        headers: {
          "Content-Type": ctype,
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
          "Cache-Control": "public, max-age=31536000, immutable",
          "Last-Modified": lastModified,
          "ETag": etag,
        },
      });
    }

    // No range: stream whole file
    const stream = fs.createReadStream(filePath);
    return new NextResponse(stream as any, {
      status: 200,
      headers: {
        "Content-Type": ctype,
        "Accept-Ranges": "bytes",
        "Content-Length": String(size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Last-Modified": lastModified,
        "ETag": etag,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Not found: ${e?.message || filePath}` }, { status: 404 });
  }
}

// Optional: fast HEAD for metadata-only probes
export async function HEAD(
  req: Request,
  ctx: { params: Promise<{ name: string[] }> }
) {
  const { name } = await ctx.params;
  const BASE_DIR = process.env.AUDIO_ROOT || "public/audio";
  const filePath = name?.length ? safeJoin(BASE_DIR, name) : null;
  if (!filePath) return new NextResponse(null, { status: 400 });

  try {
    const stat = await fs.promises.stat(filePath);
    const ctype = contentTypeFor(filePath);
    const etag = `"${stat.size}-${Number(stat.mtime)}"`;
    return new NextResponse(null, {
      headers: {
        "Content-Type": ctype,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Last-Modified": stat.mtime.toUTCString(),
        "ETag": etag,
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
