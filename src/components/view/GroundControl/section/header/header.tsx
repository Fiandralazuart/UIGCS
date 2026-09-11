import {
  CircleDot,
  Plane,
  Radio,
  Satellite,
  Settings,
  Terminal,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function HeaderStatus({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex h-11 min-w-[145px] items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3">
      <div className="text-cyan-600">{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold text-slate-400">{label}</div>
        <div className="truncate text-[10px] font-bold text-slate-600">
          {value}
        </div>
        <div className="truncate font-mono text-[9px] text-slate-400">
          {sub}
        </div>
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
      <div className="flex min-h-[84px] items-center gap-4 px-4 lg:px-6 xl:pr-8 2xl:pr-10">
        <div className="flex min-w-[285px] items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-cyan-300">
            <Terminal size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[19px] font-black tracking-[0.08em] text-slate-800">
                SOERASKY
              </h1>
              <Badge
                variant="outline"
                className="h-6 border-cyan-200 bg-cyan-50 px-2 text-[9px] font-bold text-cyan-700"
              >
                GROUND CONTROL
              </Badge>
              <Badge
                variant="outline"
                className="hidden h-6 border-slate-200 bg-slate-50 px-2 text-[9px] font-bold text-slate-400 md:flex"
              >
                VTOL DESKTOP
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
              <CircleDot size={11} />
              <span>1 SSH Session</span>
              <span>•</span>
              <span>Multiplexed</span>
              <span>•</span>
              <span>Local RTK</span>
            </div>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 border-slate-200"
          >
            <Settings size={16} />
          </Button>
          <Button
            size="sm"
            className="h-10 gap-2 bg-slate-800 px-4 text-[11px] font-bold hover:bg-slate-700"
          >
            <Wifi size={13} />
            Connect SSH
          </Button>
        </div>
        <div className="hidden items-center gap-2 xl:flex">
          <HeaderStatus
            icon={<Wifi size={11} />}
            label="WLAN (wlan0)"
            value="-52 dBm (92%)"
            sub="192.168.1.104:22"
          />
          <HeaderStatus
            icon={<Satellite size={11} />}
            label="DOP"
            value="HDOP 0.81 / VDOP 1.14"
            sub="18 SATS · 3D FIX"
          />
          <HeaderStatus
            icon={<Radio size={11} />}
            label="RF"
            value="915 MHz"
            sub="DROP 100.0% · LQ MARGINAL"
          />
          <HeaderStatus
            icon={<Plane size={11} />}
            label="RC"
            value="ELRS 2.4G"
            sub="FS: SAFE · NO LINK"
          />
          <div className="flex h-11 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4">
            <div className="h-2 w-2 rounded-full bg-slate-300" />
            <div>
              <div className="text-[9px] font-bold text-slate-500">RTK</div>
              <div className="font-mono text-[9px] text-slate-400">
                LOCAL · OFF
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
