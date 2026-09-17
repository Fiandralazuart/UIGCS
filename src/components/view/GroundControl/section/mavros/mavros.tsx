"use client";

import { Terminal } from "lucide-react";
import { ServiceCard } from "../service-card";
import { useGroundControl } from "../../useGroundControl";
import { serviceDisplay } from "../service-status";

export function Mavros() {
  const { services, connStatus, telemetry, startService, stopService } = useGroundControl();
  const { status } = services.mavros;
  const display = serviceDisplay(status);
  const connected = connStatus === "connected";

  // 2026-09-16 (atas permintaan user): "Record" sekarang benar-benar
  // menjalankan/menghentikan flight_logger (ros2 launch flight_logger
  // record_flight.launch.xml, workspace TERPISAH ~/flight_logger_ws di
  // raspi, lihat ssh-manager.ts commandFor "flightLogger") -- merekam
  // SEMUA topic MAVROS/MAVLink aktif ke rosbag2/mcap. TIDAK butuh MAVROS
  // "running" dulu (flight_logger cuma subscribe topic, tidak crash kalau
  // belum ada publisher), tapi logikanya baru berguna kalau MAVROS jalan.
  const flightLogger = services.flightLogger;
  const recording = flightLogger.status === "running" || flightLogger.status === "starting";

  return (
    <ServiceCard
      title="MAVROS"
      badge="SSH"
      status={display.label}
      statusColor={display.color}
      icon={Terminal}
      color="gray"
      footer={connected ? "SSH Connected" : "SSH Required"}
      action={display.action}
      disabled={!connected || status === "starting" || status === "stopping"}
      onAction={() => (status === "running" ? stopService("mavros") : startService("mavros"))}
      extraButtons={[
        {
          label: recording ? "Stop Rec" : "Record",
          onClick: () =>
            flightLogger.status === "running" || flightLogger.status === "starting"
              ? stopService("flightLogger")
              : startService("flightLogger"),
          disabled:
            !connected || flightLogger.status === "stopping",
        },
      ]}
      details={[
        // Bukan cuma status service ("running") -- ini bukti data BENERAN
        // masuk dari telemetry_bridge.py (topic /mavros/state), jadi kalau
        // ternyata MAVROS "running" tapi FCU belum kekoneksi/data belum
        // ngalir, ini akan tetap "false".
        { label: "MAVROS", value: telemetry.state ? "true" : "false" },
        { label: "FCU Link", value: status === "running" ? "See MAVROS log" : "No link" },
        {
          label: "FCU Connected",
          value: telemetry.state ? (telemetry.state.connected ? "true" : "false") : "--",
        },
        { label: "Flight Logger", value: recording ? "RECORDING" : flightLogger.status },
      ]}
    />
  );
}
