"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, CornerDownLeft, Footprints, MoveRight, TrendingUp, Timer as TimerIcon } from "lucide-react";
import type { TelemetryData } from "../../useGroundControl";

function fmt(n: number | undefined | null, digits = 1, suffix = ""): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "--";
  return `${n.toFixed(digits)}${suffix}`;
}

function formatElapsed(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function Stat({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-white">
      {icon}
      <span className="font-mono text-[11px] font-bold">{value}</span>
    </div>
  );
}

// Timer (waktu terbang sejak ARMED) dan jarak tempuh kumulatif (integrasi
// delta posisi lokal tiap tick telemetry) TIDAK tersedia sebagai satu
// topic MAVROS langsung -- dihitung di sini, client-side, dari data yang
// sudah ada (state.armed, localPose).
export function FlightStatBar({ telemetry }: { telemetry: TelemetryData }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const armedAtRef = useRef<number | null>(null);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const armed = telemetry.state?.armed ?? false;

  useEffect(() => {
    if (armed && armedAtRef.current === null) {
      armedAtRef.current = Date.now();
    }
    if (!armed) {
      armedAtRef.current = null;
      lastPosRef.current = null;
      // setTimeout(fn, 0) alih-alih manggil setState langsung -- pola sama
      // seperti di useGroundControl.tsx/mission-panel.tsx, menghindari
      // "setState sinkron di dalam effect" yang bikin render cascade.
      const timer = setTimeout(() => {
        setElapsedMs(0);
        setDistanceTraveled(0);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [armed]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (armedAtRef.current !== null) {
        setElapsedMs(Date.now() - armedAtRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const pose = telemetry.localPose;
    if (!pose || !armed) return;
    const prev = lastPosRef.current;
    if (prev) {
      const dx = pose.x - prev.x;
      const dy = pose.y - prev.y;
      const step = Math.sqrt(dx * dx + dy * dy);
      if (Number.isFinite(step)) {
        setDistanceTraveled((d) => d + step);
      }
    }
    lastPosRef.current = { x: pose.x, y: pose.y };
  }, [telemetry.localPose, armed]);

  const distanceToHome = telemetry.localPose
    ? Math.sqrt(telemetry.localPose.x ** 2 + telemetry.localPose.y ** 2)
    : null;

  return (
    <div className="mx-auto grid w-[200px] grid-cols-3 gap-x-3 gap-y-1.5 rounded-xl bg-slate-800 px-3 py-2.5">
      <Stat icon={<ArrowUp size={12} />} value={fmt(telemetry.vfrHud?.altitude, 1, " m")} />
      <Stat icon={<TrendingUp size={12} />} value={fmt(telemetry.vfrHud?.climb, 1, " m/s")} />
      <Stat icon={<TimerIcon size={12} />} value={formatElapsed(elapsedMs)} />
      <Stat icon={<CornerDownLeft size={12} />} value={fmt(distanceToHome, 1, " m")} />
      <Stat icon={<MoveRight size={12} />} value={fmt(telemetry.vfrHud?.groundspeed, 1, " m/s")} />
      <Stat icon={<Footprints size={12} />} value={fmt(distanceTraveled, 1, " m")} />
    </div>
  );
}
