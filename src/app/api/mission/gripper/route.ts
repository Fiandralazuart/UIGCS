import { NextResponse } from "next/server";
import { sendGripperCommand } from "@/lib/ssh-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const cmd = body?.cmd;
  if (cmd !== "open" && cmd !== "close") {
    return NextResponse.json({ ok: false, error: "cmd harus 'open' atau 'close'." }, { status: 400 });
  }
  const result = await sendGripperCommand(cmd);
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
