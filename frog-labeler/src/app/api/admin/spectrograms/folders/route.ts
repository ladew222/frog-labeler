import { NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import path from "path";

const AUDIO_ROOT = process.env.AUDIO_ROOT || "/Volumes/frog/Data";

export async function GET() {
  try {
    const entries = readdirSync(AUDIO_ROOT)
      .filter((f) => {
        const p = path.join(AUDIO_ROOT, f);
        return statSync(p).isDirectory();
      })
      .map((f) => ({
        name: f,
        fullPath: path.join(AUDIO_ROOT, f),
      }));

    return NextResponse.json(entries);
  } catch (err: any) {
    console.error("❌ Folder listing error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
