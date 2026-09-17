import { NextResponse } from "next/server";
import { getLogs, type ServiceName } from "@/lib/ssh-manager";
import { getRtkLogs } from "@/lib/rtk-manager";

const SSH_SERVICES: ServiceName[] = [
  "mavros", "vision", "mission", "rtkRelay", "lcd", "livox", "wpc", "flightLogger",
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const service = searchParams.get("service");
  if (service === "rtk") {
    return NextResponse.json({ lines: getRtkLogs() });
  }
  if (service && SSH_SERVICES.includes(service as ServiceName)) {
    return NextResponse.json({ lines: getLogs(service as ServiceName) });
  }
  return NextResponse.json({ error: "service tidak valid." }, { status: 400 });
}
