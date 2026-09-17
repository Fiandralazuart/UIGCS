import { NextResponse } from "next/server";
import { captureRetryWp1 } from "@/lib/ssh-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = captureRetryWp1({
    holdS: String(body?.holdS ?? "0.000"),
    speedMps: String(body?.speedMps ?? "nan"),
    altM: String(body?.altM ?? "1.0"),
    gripperOpen: Boolean(body?.gripperOpen),
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
