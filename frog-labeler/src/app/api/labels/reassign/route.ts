export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { fromId, toId } = await req.json();
  if (!fromId || !toId || fromId === toId) {
    return NextResponse.json({ error: "Invalid fromId/toId" }, { status: 400 });
  }

  const [from, to] = await Promise.all([
    db.label.findUnique({ where: { id: fromId } }),
    db.label.findUnique({ where: { id: toId } }),
  ]);
  if (!from || !to) return NextResponse.json({ error: "Label not found" }, { status: 404 });

  await db.segment.updateMany({ where: { labelId: fromId }, data: { labelId: toId } });
  await db.label.delete({ where: { id: fromId } });

  return NextResponse.json({ ok: true });
}
