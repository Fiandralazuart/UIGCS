import { Activity, Gauge, Globe2, Navigation, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export function Telemetry() {
  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
      <TelemetryCard
        title="FLIGHT STATE"
        endpoint="/mavros/state"
        icon={<Activity size={14} />}
      >
        <div className="grid grid-cols-2 gap-2">
          <Metric label="FCU HEARTBEAT" value="--" />
          <Metric label="FLIGHT MODE" value="--" />
          <Metric label="GUIDED LINK" value="--" />
          <Metric label="BATTERY" value="--" />
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
          <Metric label="X (NORTH)" value="--" />
          <Metric label="Y (EAST)" value="--" />
          <Metric label="Z (DOWN)" value="--" />
        </div>
      </TelemetryCard>
      <TelemetryCard
        title="GLOBAL POSE"
        endpoint="/mavros/global_position"
        icon={<Globe2 size={14} />}
      >
        <div className="space-y-2">
          <Row label="Latitude" value="--.------" />
          <Row label="Longitude" value="--.------" />
          <Row label="Alt (AMSL)" value="-- m" />
        </div>
      </TelemetryCard>
      <TelemetryCard
        title="SPEED & ALTITUDE"
        endpoint="/mavros/vfr_hud"
        icon={<Gauge size={14} />}
      >
        <div className="grid grid-cols-2 gap-2">
          <Metric label="GROUNDSPEED" value="-- m/s" />
          <Metric label="REL ALTITUDE" value="-- m" />
          <Metric label="CLIMB RATE" value="-- m/s" />
          <Metric label="HEADING" value="-- DEG" />
        </div>
      </TelemetryCard>
    </section>
  );
}
