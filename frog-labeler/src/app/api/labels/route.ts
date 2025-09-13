import { NextResponse } from "next/server";
import { db } from "@/lib/db";


export async function GET() {
const labels = await db.label.findMany({ where: { projectId: "demo" }, orderBy: { name: "asc" } });
return NextResponse.json(labels);
}