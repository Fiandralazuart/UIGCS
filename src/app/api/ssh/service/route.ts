import { NextResponse } from "next/server";
import { startService, stopService, type MissionStartOpts, type ServiceName } from "@/lib/ssh-manager";

const VALID: ServiceName[] = [
  "mavros", "vision", "mission", "rtkRelay", "lcd", "livox", "flightLogger",
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const service = body?.service as ServiceName | undefined;
  const action = body?.action as "start" | "stop" | undefined;
  if (!service || !VALID.includes(service) || (action !== "start" && action !== "stop")) {
    return NextResponse.json({ ok: false, error: "service/action tidak valid." }, { status: 400 });
  }
  // missionOpts relevan untuk 2 kombinasi: service:"mission" (useRetryFile)
  // dan service:"rtkRelay" (rtkRunner) -- keduanya action:"start" saja.
  // BUG NYATA ditemukan 2026-09-16: sebelumnya cuma di-build untuk
  // service==="mission", jadi rtkRunner dari startRtk() (useGroundControl.tsx)
  // SELALU ke-drop di sini walau sudah dikirim client -- switch RTK
  // UDP/str2str di raspi tidak pernah benar-benar terpakai lewat jalur ini.
  let missionOpts: MissionStartOpts | undefined;
  if (action === "start" && body?.missionOpts) {
    if (service === "mission") {
      const raw = body.missionOpts as { useRetryFile?: unknown };
      missionOpts = { useRetryFile: Boolean(raw.useRetryFile) };
    } else if (service === "rtkRelay") {
      const raw = body.missionOpts as { rtkRunner?: unknown };
      missionOpts = { rtkRunner: raw.rtkRunner === "str2str" ? "str2str" : "udp" };
    }
  }
  const result = action === "start" ? startService(service, missionOpts) : stopService(service);
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
