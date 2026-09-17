import { NextResponse } from "next/server";
import { startCameraTunnel, stopCameraTunnel } from "@/lib/ssh-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action as "start" | "stop" | undefined;
  if (action === "start") {
    const result = startCameraTunnel();
    if (!result.ok) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result);
  }
  if (action === "stop") {
    stopCameraTunnel();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "action tidak valid." }, { status: 400 });
}
