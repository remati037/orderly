import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

const ALLOWED_TYPES = ["audio/mpeg", "audio/wav", "audio/wave", "audio/x-wav", "audio/mp3"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only MP3 and WAV files are allowed" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 2 MB limit" }, { status: 400 });
  }

  const ext      = file.name.split(".").pop() ?? "mp3";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer   = Buffer.from(await file.arrayBuffer());

  const supabase = adminClient();

  // Ensure the bucket exists — creates it on first upload, no-ops if already present
  await supabase.storage.createBucket("sounds", { public: true });

  const { error: uploadError } = await supabase.storage
    .from("sounds")
    .upload(filename, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from("sounds").getPublicUrl(filename);

  return NextResponse.json({ url: publicUrl, filename: file.name });
}
