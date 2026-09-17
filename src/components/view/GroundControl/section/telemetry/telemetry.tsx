"use client";

import { Activity, Gauge, Globe2, Navigation, Radar, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGroundControl } from "../../useGroundControl";

function TelemetryCard({
  title,
  endpoint,
  icon,
  children,
}: {
  title: string;
  endpoint: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="px-3 pb-2 pt-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-500">
            {icon}
          </div>
          <div>
            <CardTitle className="text-[12px] font-black tracking-wide text-slate-700">
              {title}
            </CardTitle>
            <p className="mt-1 font-mono text-[9px] text-slate-400">
              {endpoint}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">{children}</CardContent>
    </Card>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-[#f5faff] px-2.5 py-2.5">
      <div className="mb-2 text-[9px] font-medium text-slate-400">{label}</div>
      <span className="font-mono text-[14px] font-bold text-slate-600">
        {value}
      </span>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5">
      <span className="font-mono text-[9px] text-slate-400">{label}</span>
      <span className="font-mono text-[9px] font-bold text-slate-600">
        {value}
      </span>
    </div>
  );
}

// telemetry.<field>.ts sudah bukan "--" hanya kalau server pernah menerima
// setidaknya satu pesan dari topic itu (lihat ssh-manager.ts,
// handleTelemetryChunk()) -- sebelum MAVROS jalan, semuanya tetap "--".
function fmt(n: number | undefined, digits = 2, suffix = ""): string {
  if (n === undefined || Number.isNaN(n)) return "--";
  return `${n.toFixed(digits)}${suffix}`;
}

function fmtCm(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return `${n.toFixed(1)} cm`;
}

export function Telemetry() {
  const { telemetry } = useGroundControl();
  const { state, localPose, globalPose, vfrHud, livoxLateral } = telemetry;

  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-5">
      <TelemetryCard
        title="FLIGHT STATE"
        endpoint="/mavros/state"
        icon={<Activity size={14} />}
      >
        <div className="grid grid-cols-2 gap-2">
          <Metric label="FCU HEARTBEAT" value={state ? (state.connected ? "OK" : "LOST") : "--"} />
          <Metric label="FLIGHT MODE" value={state?.mode || "--"} />
          <Metric label="GUIDED LINK" value={state ? (state.guided ? "ON" : "OFF") : "--"} />
          <Metric label="ARMED" value={state ? (state.armed ? "ARMED" : "DISARMED") : "--"} />
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
          <span className="flex items-center gap-1 text-[8px] font-bold text-slate-500">
            <Radio size={10} />
            Radio Link
          </span>
          <span className="font-mono text-[8px] text-slate-400">RC 16 CH</span>
        </div>
      </TelemetryCard>
      <TelemetryCard
        title="LOCAL POSE (NED)"
        endpoint="/mavros/local_position/pose"
        icon={<Navigation size={14} />}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[8px] text-slate-400">Reference Frame</span>
          <Badge
            variant="outline"
            className="border-cyan-200 bg-cyan-50 text-[8px] text-cyan-700"
          >
            Relative Home
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="X (NORTH)" value={fmt(localPose?.x, 2, " m")} />
          <Metric label="Y (EAST)" value={fmt(localPose?.y, 2, " m")} />
          <Metric label="Z (DOWN)" value={fmt(localPose?.z, 2, " m")} />
        </div>
      </TelemetryCard>
      <TelemetryCard
        title="GLOBAL POSE"
        endpoint="/mavros/global_position"
        icon={<Globe2 size={14} />}
      >
        <div className="space-y-2">
          <Row label="Latitude" value={fmt(globalPose?.lat, 6)} />
          <Row label="Longitude" value={fmt(globalPose?.lon, 6)} />
          <Row label="Alt (AMSL)" value={fmt(globalPose?.alt, 2, " m")} />
        </div>
      </TelemetryCard>
      <TelemetryCard
        title="LIVOX"
        endpoint="/livox/lateral_distance"
        icon={<Radar size={14} />}
      >
        <div className="grid grid-cols-2 gap-2">
          <Metric label="FRONT" value={fmtCm(livoxLateral?.frontCm)} />
          <Metric label="BACK" value={fmtCm(livoxLateral?.backCm)} />
          <Metric label="LEFT" value={fmtCm(livoxLateral?.leftCm)} />
          <Metric label="RIGHT" value={fmtCm(livoxLateral?.rightCm)} />
        </div>
      </TelemetryCard>
      <TelemetryCard
        title="SPEED & ALTITUDE"
        endpoint="/mavros/vfr_hud"
        icon={<Gauge size={14} />}
      >
        <div className="grid grid-cols-2 gap-2">
          <Metric label="GROUNDSPEED" value={fmt(vfrHud?.groundspeed, 2, " m/s")} />
          <Metric label="REL ALTITUDE" value={fmt(vfrHud?.altitude, 2, " m")} />
          <Metric label="CLIMB RATE" value={fmt(vfrHud?.climb, 2, " m/s")} />
          <Metric label="HEADING" value={fmt(vfrHud?.heading, 0, " DEG")} />
        </div>
      </TelemetryCard>
    </section>
  );
}
