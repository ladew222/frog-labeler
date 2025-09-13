import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";


const Body = z.object({
audioId: z.string(),
startS: z.number().nonnegative(),
endS: z.number().positive(),
labelId: z.string(),
confidence: z.number().min(0).max(1).optional(),
notes: z.string().optional(),
}).refine((v) => v.endS > v.startS, { message: "endS must be > startS" });


export async function POST(req: NextRequest) {
const data = Body.parse(await req.json());
const seg = await db.segment.create({ data });
return NextResponse.json(seg);
}