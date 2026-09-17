"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Disc,
  FileText,
  MapPin,
  Monitor,
  Radar,
  RotateCw,
  Satellite,
  Terminal,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGroundControl } from "../../useGroundControl";
import { serviceDisplay } from "../service-status";

// 2026-09-12: VISION dan CAMERA digabung jadi satu tab (satu SSH exec
// channel yang sama untuk vision_pipeline + event buka/tutup tunnel
// kamera, lihat useGroundControl -> logs.visionCamera). LCD = `sudo
// journalctl -u wp_trigger_controller -f` lewat SSH (lihat ssh-manager.ts,
// commandFor "lcd"), start/stop-nya lewat tombol di tab ini (bukan
// ServiceCard terpisah, cukup satu baris di sini). LIVOX = stdout dari
// livox_lateral_distance.py (raw UDP 2D-lateral parser, lihat
// ssh-manager.ts commandFor "livox" + handleTelemetryChunk), log-nya
// realtime dari logs.livox seperti service lain. WPC (Waypoint Coordinate)
// = log "Ambil WP"/"Tambah WP"/"Delete WP" (prefix [ambilwp]/[addwp]/
// [deletewp]) yang dulu numpang di tab MISSION, sekarang tab sendiri
// (lihat ssh-manager.ts, appendLog("wpc", ...) di captureWaypoint()/
// addWaypoint()/deleteWaypoint()).
// FLIGHTLOG = stdout `ros2 launch flight_logger record_flight.launch.xml`
// (tombol "Record" di kartu MAVROS, lihat ssh-manager.ts commandFor
// "flightLogger") -- merekam SEMUA topic MAVROS/MAVLink ke rosbag2/mcap.
type LogKey = "rtk" | "mavros" | "visionCamera" | "mission" | "livox" | "lcd" | "wpc" | "flightLogger";

const logTabs: { key: LogKey; label: string; icon: React.ElementType }[] = [
  { key: "rtk", label: "RTK", icon: Satellite },
  { key: "mavros", label: "MAVROS", icon: Terminal },
  { key: "flightLogger", label: "FLIGHTLOG", icon: Disc },
  { key: "visionCamera", label: "VISION/CAM", icon: Video },
  { key: "mission", label: "MISSION", icon: FileText },
  { key: "wpc", label: "WPC", icon: MapPin },
  { key: "livox", label: "LIVOX", icon: Radar },
  { key: "lcd", label: "LCD", icon: Monitor },
];

function parseLine(raw: string): { level: "INFO" | "WARN" | "ERROR"; message: string } {
  if (raw.startsWith("[system]")) {
    return { level: "INFO", message: raw };
  }
  if (/error/i.test(raw)) return { level: "ERROR", message: raw };
  if (/warn/i.test(raw)) return { level: "WARN", message: raw };
  return { level: "INFO", message: raw };
}

export function Logs() {
  const [activeTab, setActiveTab] = useState<LogKey>("mavros");
  const [lcdRestarting, setLcdRestarting] = useState(false);
  const { logs, services, connStatus, startService, stopService, restartLcdDisplay } =
    useGroundControl();

  const rawLines: Record<LogKey, string[]> = {
    rtk: logs.rtk,
    mavros: logs.mavros,
    visionCamera: logs.visionCamera,
    mission: logs.mission,
    livox: logs.livox,
    lcd: logs.lcd,
    wpc: logs.wpc,
    flightLogger: logs.flightLogger,
  };

  const lcdStatus = services.lcd.status;
  const lcdDisplay = serviceDisplay(lcdStatus);
  const lcdConnected = connStatus === "connected";

  const activeLogs = rawLines[activeTab];
  const parsed = activeLogs.length > 0 ? activeLogs.map(parseLine) : [
    { level: "INFO" as const, message: "No log entries yet." },
  ];

  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll ke bawah tiap kali baris baru muncul, atau pindah tab.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [parsed.length, activeTab]);

  return (
    <Card className="overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
              <Terminal size={15} />
            </div>
            <div>
              <CardTitle className="text-[13px] font-black tracking-wide text-slate-700">
                SERVICE LOGS
              </CardTitle>
              <p className="font-mono text-[9px] text-slate-400">
                Runtime output from Ground Control services
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "lcd" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!lcdConnected || lcdRestarting}
                  onClick={async () => {
                    setLcdRestarting(true);
                    try {
                      await restartLcdDisplay();
                    } finally {
                      setLcdRestarting(false);
                    }
                  }}
                  className="h-7 text-[9px] font-bold"
                  title="systemctl restart wp_trigger_controller.service (OLED + tombol fisik, BUKAN cuma log viewer)"
                >
                  <RotateCw size={11} className={lcdRestarting ? "mr-1 animate-spin" : "mr-1"} />
                  {lcdRestarting ? "Restarting..." : "Restart LCD"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!lcdConnected || lcdStatus === "starting" || lcdStatus === "stopping"}
                  onClick={() =>
                    lcdStatus === "running" ? stopService("lcd") : startService("lcd")
                  }
                  className="h-7 text-[9px] font-bold"
                >
                  {lcdStatus === "running" ? "Stop" : lcdDisplay.action} LCD Log
                </Button>
              </>
            )}
            <Badge
              variant="outline"
              className="border-slate-200 bg-slate-50 text-[9px] text-slate-500"
            >
              {parsed.length} entries
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 pt-2"
          role="tablist"
          aria-label="Service logs"
        >
          {logTabs.map(({ key, label, icon: Icon }) => {
            const isActive = key === activeTab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(key)}
                className={`flex min-w-[112px] items-center justify-center gap-2 border-b-2 px-4 py-3 text-[10px] font-black tracking-wide transition-colors ${isActive ? "border-cyan-500 bg-white text-cyan-700" : "border-transparent text-slate-400 hover:bg-white hover:text-slate-600"}`}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
        <div
          ref={scrollRef}
          className="h-[320px] max-h-[320px] overflow-y-auto bg-[#07111f] p-4 font-mono text-[11px] leading-6"
          role="tabpanel"
        >
          {parsed.map((entry, index) => (
            <div
              key={index}
              className="flex min-w-max items-start gap-3 border-b border-white/5 py-1.5 last:border-0"
            >
              {entry.level === "INFO" ? (
                <CircleCheck size={14} className="mt-1 text-cyan-500" />
              ) : (
                <CircleAlert
                  size={14}
                  className={`mt-1 ${entry.level === "ERROR" ? "text-red-500" : "text-amber-500"}`}
                />
              )}
              <span className={`font-bold ${entry.level === "ERROR" ? "text-red-600" : entry.level === "WARN" ? "text-amber-600" : "text-cyan-600"}`}>
                {entry.level}
              </span>
              <span className="text-slate-300">{entry.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
