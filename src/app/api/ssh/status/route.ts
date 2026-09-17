import { NextResponse } from "next/server";
import { getStatus } from "@/lib/ssh-manager";
import { getRtkStatus } from "@/lib/rtk-manager";

export async function GET() {
  return NextResponse.json({ ssh: await getStatus(), rtk: getRtkStatus() });
}
