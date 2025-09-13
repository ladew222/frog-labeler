import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ audioId: string }> }
) {
  const { audioId } = await ctx.params;
  const segments = await db.segment.findMany({
    where: { audioId },
    include: { label: true },
    orderBy: { startS: "asc" },
  });
  return NextResponse.json(segments);
}
