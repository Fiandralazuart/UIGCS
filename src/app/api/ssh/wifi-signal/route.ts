import { NextResponse } from "next/server";
import { getWifiSignal } from "@/lib/ssh-manager";

export async function GET() {
  const result = await getWifiSignal();
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
