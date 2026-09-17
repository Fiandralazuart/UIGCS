"use client";

import { Radar } from "lucide-react";
import { ServiceCard } from "../service-card";
import { useGroundControl } from "../../useGroundControl";
import { serviceDisplay } from "../service-status";

// 2026-09-13: sekarang aktif -- BUKAN pakai livox_centering (library lama
// waypoint_mission-era, masih dead code, TIDAK disentuh) atau
// livox_ros_driver2/ROS2 (device sudah streaming raw UDP terus-menerus
// tanpa command-handshake, jadi backend langsung baca raw UDP, lihat
// livox_lateral_distance.py + ssh-manager.ts commandFor("livox")) --
// standalone total, tidak menyentuh waypoint_mission/mission_node sama
// sekali.
export function Livox() {
  const { services, connStatus, telemetry, startService, stopService } = useGroundControl();
  const { status } = services.livox;
  const display = serviceDisplay(status);
  const connected = connStatus === "connected";
  const d = telemetry.livoxLateral;

  const fmt = (cm: number | null | undefined) => (cm === null || cm === undefined ? "--" : `${cm.toFixed(1)} cm`);

  return (
    <ServiceCard
      title="LIVOX"
      badge="SSH"
      status={display.label}
      statusColor={display.color}
      icon={Radar}
      color="gray"
      footer={connected ? "SSH Connected" : "SSH Required"}
      action={display.action}
      disabled={!connected || status === "starting" || status === "stopping"}
      onAction={() => (status === "running" ? stopService("livox") : startService("livox"))}
      details={[
        { label: "FRONT", value: fmt(d?.frontCm) },
        { label: "BACK", value: fmt(d?.backCm) },
        { label: "LEFT", value: fmt(d?.leftCm) },
        { label: "RIGHT", value: fmt(d?.rightCm) },
      ]}
    />
  );
}
