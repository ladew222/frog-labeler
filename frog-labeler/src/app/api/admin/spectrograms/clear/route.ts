import { NextResponse } from "next/server";
import { clearProgress } from "@/lib/spectroProgress";

export async function POST() {
  clearProgress();
  return NextResponse.json({ message: "Progress cache cleared." });
}
