import { NextResponse } from "next/server";
import { sendKey } from "@/lib/ssh-manager";

// Kirim keypress mentah ke gerbang mission_node.cpp yang sedang berjalan
// (butuh pty, lihat startService() di ssh-manager.ts). "1" = accept/lanjut,
// Cancel TIDAK lewat sini -- itu pakai stopService("mission") biasa (SIGINT).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const key = body?.key as string | undefined;
  if (!key) {
    return NextResponse.json({ ok: false, error: "key tidak valid." }, { status: 400 });
  }
  const result = sendKey("mission", key);
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
