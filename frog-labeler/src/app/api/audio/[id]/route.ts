// src/app/api/audio/[id]/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type CtxPromise = Promise<{ params: { id: string } }>;

export async function GET(_req: Request, ctx: CtxPromise) {
  const { params } = await ctx;                 // ✅ await the context
  const audio = await db.audioFile.findUnique({ where: { id: params.id } });
  if (!audio) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(audio);
}
