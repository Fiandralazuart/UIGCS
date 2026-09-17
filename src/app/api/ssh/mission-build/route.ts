import { NextResponse } from "next/server";
import { buildMission } from "@/lib/ssh-manager";

export async function POST() {
  const result = buildMission();
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
