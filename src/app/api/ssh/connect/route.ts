import { NextResponse } from "next/server";
import { connect } from "@/lib/ssh-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.host !== "string" ||
    typeof body.username !== "string" ||
    typeof body.password !== "string"
  ) {
    return NextResponse.json(
      { ok: false, error: "host, username, password wajib diisi." },
      { status: 400 },
    );
  }
  const port = typeof body.port === "number" ? body.port : 22;
  const result = await connect({ host: body.host, port, username: body.username, password: body.password });
  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
