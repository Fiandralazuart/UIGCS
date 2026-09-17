import { NextResponse } from "next/server";
import { getTelemetry } from "@/lib/ssh-manager";

export async function GET() {
  return NextResponse.json(getTelemetry());
}
