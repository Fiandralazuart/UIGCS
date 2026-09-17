"use client";

import { useState } from "react";
import { Monitor } from "lucide-react";
import { ServiceCard } from "../service-card";
import { useGroundControl } from "../../useGroundControl";
import { serviceDisplay } from "../service-status";

// Dulu kartu ini kontrol tunnel kamera -- sekarang jadi trigger LCD log
// (journalctl -u wp_trigger_controller -f). Panel video kamera besar
// (CameraPanel, di atas grid ini) TIDAK terpengaruh, tetap punya tombol
// Show/Hide Camera sendiri. onAction di sini SENGAJA cuma start/stop
// service "lcd" -- TIDAK auto-switch tab aktif di panel Logs (itu state
// lokal Logs sendiri, kartu ini memang tidak bisa/tidak boleh menyentuhnya).
export function LcdTrigger() {
  const { services, connStatus, startService, stopService, sendGripperCommand } =
    useGroundControl();
  const { status } = services.lcd;
  const display = serviceDisplay(status);
  const connected = connStatus === "connected";

  // 2026-09-16 (atas permintaan user): Open/Close sekarang benar-benar
  // publish ke /gripper_cmd (lihat ssh-manager.ts sendGripperCommand()) --
  // aman dipakai kapan pun (auto-start servo_driver standalone kalau belum
  // ada instance hidup sama sekali, TIDAK pernah start instance kedua kalau
  // mission sedang jalan -- servo_driver-nya sudah include otomatis lewat
  // 03_mission.launch.xml). Loading state per-tombol supaya tidak
  // double-klik selagi masih proses start+publish (bisa ambil ~2.5 detik
  // kalau perlu start node standalone dulu).
  const [gripperBusy, setGripperBusy] = useState<"open" | "close" | null>(null);
  const handleGripper = async (cmd: "open" | "close") => {
    setGripperBusy(cmd);
    try {
      await sendGripperCommand(cmd);
    } finally {
      setGripperBusy(null);
    }
  };

  return (
    <ServiceCard
      title="LCD & GRIPPER"
      badge="SSH"
      status={display.label}
      statusColor={display.color}
      icon={Monitor}
      color="cyan"
      footer={connected ? "SSH Connected" : "SSH Required"}
      action={display.action}
      disabled={!connected || status === "starting" || status === "stopping"}
      onAction={() => (status === "running" ? stopService("lcd") : startService("lcd"))}
      extraButtons={[
        {
          label: gripperBusy === "open" ? "Opening..." : "Open",
          onClick: () => handleGripper("open"),
          disabled: !connected || gripperBusy !== null,
        },
        {
          label: gripperBusy === "close" ? "Closing..." : "Close",
          onClick: () => handleGripper("close"),
          disabled: !connected || gripperBusy !== null,
        },
      ]}
      details={[
        { label: "Source", value: "journalctl -u wp_trigger_controller" },
        { label: "View in", value: "Logs panel → LCD tab" },
      ]}
    />
  );
}
