import { NextResponse } from "next/server";
import { restartLcdDisplay } from "@/lib/ssh-manager";

export async function POST() {
  const result = await restartLcdDisplay();
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
