import { NextResponse } from "next/server";
import { buildRetryMission } from "@/lib/ssh-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const batch = Number(body?.batch);
  if (!Number.isInteger(batch) || batch < 2) {
    return NextResponse.json({ ok: false, error: "batch harus >= 2." }, { status: 400 });
  }
  const result = await buildRetryMission(batch);
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
