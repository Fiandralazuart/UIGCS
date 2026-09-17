import { NextResponse } from "next/server";
import { deleteWaypoint } from "@/lib/ssh-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const index = Number(body?.index);
  if (!Number.isInteger(index) || index < 1) {
    return NextResponse.json({ ok: false, error: "index tidak valid." }, { status: 400 });
  }
  const result = await deleteWaypoint(index);
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
