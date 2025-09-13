export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const audio = await db.audioFile.findUnique({
    where: { id: params.id },
  });
  if (!audio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(audio);
}
