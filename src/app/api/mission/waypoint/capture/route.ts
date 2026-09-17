import { NextResponse } from "next/server";
import { captureWaypoint } from "@/lib/ssh-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const index = Number(body?.index);
  if (!Number.isInteger(index) || index < 1) {
    return NextResponse.json({ ok: false, error: "index tidak valid." }, { status: 400 });
  }
  const result = captureWaypoint({
    index,
    holdS: String(body?.holdS ?? "0.000"),
    speedMps: String(body?.speedMps ?? "nan"),
    altM: String(body?.altM ?? "1.0"),
    gripperOpen: Boolean(body?.gripperOpen),
    batch: body?.batch !== undefined ? String(body.batch) : undefined,
    land: Boolean(body?.land),
    metadataOnly: Boolean(body?.metadataOnly),
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
