// src/app/api/_health/db/route.ts
export const runtime = "nodejs"; // ✅ Prisma requires Node.js runtime

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const count = await db.audioFile.count();
    return NextResponse.json({ ok: true, count });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
