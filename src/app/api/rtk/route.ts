import { NextResponse } from "next/server";
import { startRtk, stopRtk } from "@/lib/rtk-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action as "start" | "stop" | undefined;
  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ ok: false, error: "action tidak valid." }, { status: 400 });
  }
  const runner = body?.runner === "str2str" ? "str2str" : "udp";
  const dest = typeof body?.dest === "string" ? body.dest : undefined;
  const result = action === "start" ? startRtk(runner, dest) : stopRtk();
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
