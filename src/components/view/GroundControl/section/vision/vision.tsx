"use client";

import { Crosshair } from "lucide-react";
import { ServiceCard } from "../service-card";
import { useGroundControl } from "../../useGroundControl";
import { serviceDisplay } from "../service-status";

export function Vision() {
  const { services, connStatus, telemetry, startService, stopService } = useGroundControl();
  const { status } = services.vision;
  const display = serviceDisplay(status);
  const connected = connStatus === "connected";
  const fps = telemetry.fiducialFps?.fps;

  return (
    <ServiceCard
      title="VISION"
      badge="SSH"
      status={display.label}
      statusColor={display.color}
      icon={Crosshair}
      color="purple"
      footer={connected ? "SSH Connected" : "SSH Required"}
      action={display.action}
      disabled={!connected || status === "starting" || status === "stopping"}
      onAction={() => (status === "running" ? stopService("vision") : startService("vision"))}
      details={[
        { label: "FPS", value: fps === undefined ? "--" : fps.toFixed(1) },
        { label: "Remote PID", value: status === "running" ? "tracked (see logs)" : "--" },
        { label: "Uptime", value: status === "running" ? "Running" : "Idle" },
      ]}
    />
  );
}
