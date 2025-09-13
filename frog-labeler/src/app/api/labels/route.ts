export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const labels = await db.label.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { segments: true } } }, // usage counts
  });
  return NextResponse.json(labels);
}

export async function POST(req: Request) {
  const { projectId = "demo", name, color, hotkey } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const label = await db.label.create({
    data: { projectId, name: name.trim(), color: color ?? null, hotkey: hotkey ?? null },
  });
  return NextResponse.json(label, { status: 201 });
}
