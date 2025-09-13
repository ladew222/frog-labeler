export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, color, hotkey } = await req.json();
  const updated = await db.label.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(hotkey !== undefined ? { hotkey } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // If you want to HARD block deletes when used, uncomment below:
  // const usage = await db.segment.count({ where: { labelId: id } });
  // if (usage > 0) return NextResponse.json({ error: "Label in use" }, { status: 409 });

  await db.label.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
