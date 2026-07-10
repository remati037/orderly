import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/roles";

const CHANNELS = ["telefon", "email", "napomena"] as const;

export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("recovery_notes")
    .select("id, channel, body, created_at, author:team_members(email, name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}

// Logging a note is how a contact attempt gets recorded: a phone/email note
// bumps `attempts` and stamps `last_contacted_at`. A plain "napomena" does not.
export async function POST(request: NextRequest) {
  const { error: authError, member } = await requireRole(["owner", "agent"]);
  if (authError) return authError;
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { task_id, channel, body, next_follow_up_at } = await request.json();

  if (!task_id || !body?.trim())
    return NextResponse.json({ error: "task_id i tekst su obavezni" }, { status: 400 });

  const ch = CHANNELS.includes(channel) ? channel : "napomena";

  const supabase = adminClient();

  const { data: note, error } = await supabase
    .from("recovery_notes")
    .insert({ task_id, author_id: member.id, channel: ch, body: body.trim() })
    .select("id, channel, body, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (ch !== "napomena") {
    const { data: task } = await supabase
      .from("recovery_tasks")
      .select("attempts, stage")
      .eq("id", task_id)
      .single();

    await supabase
      .from("recovery_tasks")
      .update({
        attempts: (task?.attempts ?? 0) + 1,
        last_contacted_at: new Date().toISOString(),
        next_follow_up_at: next_follow_up_at || null,
        // First real contact moves the card out of "novo" on its own.
        stage: task?.stage === "novo" ? "kontaktiran" : task?.stage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task_id);
  }

  return NextResponse.json(note, { status: 201 });
}
