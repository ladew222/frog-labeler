import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// In Next 15, params can be a Promise in route handlers.
// Take `params` as a Promise and await it.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const audio = await db.audioFile.findUnique({ where: { id } });
  if (!audio) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(audio);
}
