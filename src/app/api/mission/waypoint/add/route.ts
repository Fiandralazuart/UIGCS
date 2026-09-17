import { NextResponse } from "next/server";
import { addWaypoint } from "@/lib/ssh-manager";

export async function POST() {
  const result = await addWaypoint();
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
