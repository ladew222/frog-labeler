import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), ".spectro-cache");
const CACHE_FILE = path.join(DATA_DIR, "progress.json");

export async function GET() {
  try {
    // ✅ Always reload from disk so the UI shows current progress
    if (!fs.existsSync(CACHE_FILE)) {
      return NextResponse.json({});
    }

    const text = fs.readFileSync(CACHE_FILE, "utf8");
    const data = JSON.parse(text);

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("❌ Error reading progress cache:", err);
    return NextResponse.json(
      { error: "Failed to read progress cache" },
      { status: 500 }
    );
  }
}
