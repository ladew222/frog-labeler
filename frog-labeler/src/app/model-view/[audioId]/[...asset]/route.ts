export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";
import {
  contentTypeForAsset,
  modelResultDirForUri,
  pathExists,
} from "@/lib/modelResults";

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

type ParamP = { params: Promise<{ audioId: string; asset: string[] }> };

export async function GET(_req: Request, { params }: ParamP) {
  const { audioId, asset } = await params;
  const requested = asset?.join("/") || "index.html";

  const audio = await db.audioFile.findUnique({
    where: { id: audioId },
    select: { id: true, projectId: true, uri: true },
  });
  if (!audio) return bad("Audio not found", 404);

  const { user } = await getSessionOrThrow();
  await requireProjectRole(user.id, audio.projectId, "VIEWER");

  const baseDir = modelResultDirForUri(audio.uri);
  if (!baseDir || !(await pathExists(baseDir))) {
    return bad("Model results not found for this file", 404);
  }

  const safePath = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(baseDir, safePath);

  if (!filePath.startsWith(baseDir)) {
    return bad("Invalid asset path", 400);
  }
  if (!(await pathExists(filePath))) {
    return bad("Asset not found", 404);
  }

  const bytes = await fs.readFile(filePath);
  const body = new Uint8Array(bytes);
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentTypeForAsset(filePath),
      "Cache-Control": "no-store",
    },
  });
}
