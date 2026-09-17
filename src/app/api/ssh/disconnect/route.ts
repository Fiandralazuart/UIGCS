import { NextResponse } from "next/server";
import { disconnect } from "@/lib/ssh-manager";

export async function POST() {
  disconnect();
  return NextResponse.json({ ok: true });
}
