import { NextResponse } from "next/server";
import { resetAllWaypoints } from "@/lib/ssh-manager";

export async function POST() {
  const result = await resetAllWaypoints();
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
