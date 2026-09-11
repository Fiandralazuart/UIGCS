"use client";

import { useState } from "react";
import {
  Camera,
  CircleAlert,
  CircleCheck,
  FileText,
  Monitor,
  Radio,
  Satellite,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LogKey = "rtk" | "mavros" | "vision" | "mission" | "camera" | "lcd";

type LogEntry = {
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
};

const logTabs: { key: LogKey; label: string; icon: React.ElementType }[] = [
  { key: "rtk", label: "RTK", icon: Satellite },
  { key: "mavros", label: "MAVROS", icon: Terminal },
  { key: "vision", label: "VISION", icon: Radio },
  { key: "mission", label: "MISSION", icon: FileText },
  { key: "camera", label: "CAMERA", icon: Camera },
  { key: "lcd", label: "LCD", icon: Monitor },
];

const logs: Record<LogKey, LogEntry[]> = {
  rtk: [
    { time: "--:--:--", level: "INFO", message: "RTK service is stopped." },
    {
      time: "--:--:--",
      level: "WARN",
      message: "Waiting for NTRIP caster connection.",
    },
    {
      time: "--:--:--",
      level: "INFO",
      message: "Fix status: NO FIX · Satellites: 0.",
    },
  ],
  mavros: [
    { time: "--:--:--", level: "INFO", message: "MAVROS service is stopped." },
    {
      time: "--:--:--",
      level: "WARN",
      message: "SSH connection is required to start MAVROS.",
    },
    { time: "--:--:--", level: "INFO", message: "FCU link: No link." },
  ],
  vision: [
    { time: "--:--:--", level: "INFO", message: "Vision pipeline is idle." },
    {
      time: "--:--:--",
      level: "WARN",
      message: "Remote vision_pipeline process is not running.",
    },
    { time: "--:--:--", level: "INFO", message: "Waiting for SSH connection." },
  ],
  mission: [
    {
      time: "--:--:--",
      level: "INFO",
      message: "Mission execution is on standby.",
    },
    {
      time: "--:--:--",
      level: "INFO",
      message: "mission.yaml loaded with 5 waypoints.",
    },
    {
      time: "--:--:--",
      level: "WARN",
      message: "Mission start is disabled until the vehicle is connected.",
    },
  ],
  camera: [
    { time: "--:--:--", level: "INFO", message: "Camera tunnel is closed." },
    {
      time: "--:--:--",
      level: "WARN",
      message: "SSH local port-forward is not active.",
    },
    {
      time: "--:--:--",
      level: "INFO",
      message: "Expected stream: MJPEG / HTTP on localhost:8090.",
    },
  ],
  lcd: [
    {
      time: "--:--:--",
      level: "INFO",
      message: "LCD controller is ready and waiting for button input.",
    },
    {
      time: "--:--:--",
      level: "INFO",
      message: "Button BTN_1 pressed → action: OPEN MAIN MENU.",
    },
    {
      time: "--:--:--",
      level: "INFO",
      message: "Button BTN_2 pressed → action: SELECT MISSION.",
    },
    {
      time: "--:--:--",
      level: "WARN",
      message:
        "Button START pressed → mission start blocked: vehicle disconnected.",
    },
    {
      time: "--:--:--",
      level: "INFO",
      message: "Button BACK pressed → action: RETURN TO STATUS SCREEN.",
    },
  ],
};

const levelStyles = {
  INFO: "text-cyan-600",
  WARN: "text-amber-600",
  ERROR: "text-red-600",
};

export function Logs() {
  const [activeTab, setActiveTab] = useState<LogKey>("mavros");
  const activeLogs = logs[activeTab];

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
          <Badge
            variant="outline"
            className="border-slate-200 bg-slate-50 text-[9px] text-slate-500"
          >
            {activeLogs.length} entries
          </Badge>
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
          className="min-h-[220px] overflow-y-auto bg-[#07111f] p-4 font-mono text-[11px] leading-6"
          role="tabpanel"
        >
          {activeLogs.map((entry, index) => (
            <div
              key={`${entry.time}-${index}`}
              className="flex min-w-max items-start gap-3 border-b border-white/5 py-1.5 last:border-0"
            >
              <span className="text-slate-500">{entry.time}</span>
              {entry.level === "INFO" ? (
                <CircleCheck size={14} className="mt-1 text-cyan-500" />
              ) : (
                <CircleAlert
                  size={14}
                  className={`mt-1 ${entry.level === "ERROR" ? "text-red-500" : "text-amber-500"}`}
                />
              )}
              <span className={`font-bold ${levelStyles[entry.level]}`}>
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
