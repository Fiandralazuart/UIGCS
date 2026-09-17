"use client";

import { useState } from "react";
import { Satellite } from "lucide-react";
import { ServiceCard } from "../service-card";
import { useGroundControl } from "../../useGroundControl";
import { serviceDisplay } from "../service-status";

// Switch runner (2026-09-16, atas permintaan user): "udp" (default,
// rtk_base_forward.py/rtk_rover_relay.py, Python/UDP broadcast -- arsitektur
// yang SUDAH terbukti jalan di proyek ini) atau "str2str" (RTKLIB, TCP
// client/server ke SATU IP). Dikunci saat RTK sedang jalan/berhenti supaya
// tidak ganti runner di tengah start/stop.
export function Rtk() {
  const { rtk, services, connStatus, startRtk, stopRtk } = useGroundControl();
  const relay = services.rtkRelay;
  const display = serviceDisplay(rtk.status);
  const connected = connStatus === "connected";
  const [runner, setRunner] = useState<"udp" | "str2str">("udp");
  const runnerLocked = rtk.status !== "stopped" && rtk.status !== "error";

  return (
    <ServiceCard
      title="RTK"
      badge="LOCAL+SSH"
      status={display.label}
      statusColor={display.color}
      icon={Satellite}
      color="blue"
      footer={connected ? "Laptop + Raspi relay" : "Laptop only (SSH not connected)"}
      action={display.action}
      disabled={rtk.status === "starting" || rtk.status === "stopping"}
      onAction={() => (rtk.status === "running" ? stopRtk() : startRtk(runner))}
      details={[
        { label: "Laptop (Base)", value: rtk.status },
        { label: "Raspi (Rover relay)", value: connected ? relay.status : "SSH required" },
        { label: "Source", value: "F9P Base (serial)" },
      ]}
    >
      <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5">
        <span className="text-[9px] font-bold text-slate-400">Runner</span>
        <div className="flex rounded-full border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            disabled={runnerLocked}
            onClick={() => setRunner("udp")}
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold transition disabled:opacity-50 ${
              runner === "udp" ? "bg-cyan-600 text-white" : "text-slate-500"
            }`}
            title="rtk_base_forward.py / rtk_rover_relay.py (Python/UDP, broadcast 2 IP)"
          >
            UDP
          </button>
          <button
            type="button"
            disabled={runnerLocked}
            onClick={() => setRunner("str2str")}
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold transition disabled:opacity-50 ${
              runner === "str2str" ? "bg-amber-500 text-white" : "text-slate-500"
            }`}
            title="RTKLIB str2str (TCP, SATU tujuan -- otomatis pakai IP raspi yang sedang connected)"
          >
            str2str
          </button>
        </div>
      </div>
    </ServiceCard>
  );
}
