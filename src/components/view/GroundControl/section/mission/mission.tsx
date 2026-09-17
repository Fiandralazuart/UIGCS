"use client";

import { Flag } from "lucide-react";
import { ServiceCard } from "../service-card";
import { useGroundControl } from "../../useGroundControl";
import { serviceDisplay } from "../service-status";

export function Mission() {
  const {
    services,
    connStatus,
    startService,
    stopService,
    sendMissionAccept,
    sendMissionCancel,
  } = useGroundControl();
  const { status } = services.mission;
  const display = serviceDisplay(status);
  const connected = connStatus === "connected";
  const running = status === "running";

  return (
    <ServiceCard
      title="MISSION"
      badge="SSH"
      status={display.label}
      statusColor={display.color}
      icon={Flag}
      color="yellow"
      footer={connected ? "SSH Connected" : "SSH Required"}
      action={display.action}
      disabled={!connected || status === "starting" || status === "stopping"}
      onAction={() => (status === "running" ? stopService("mission") : startService("mission"))}
      headerExtra={
        running && (
          <span className="flex items-center gap-1.5 rounded-full bg-yellow-50 px-2 py-1 text-[8px] font-bold text-yellow-700">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-500" />
            </span>
            IN PROGRESS
          </span>
        )
      }
      extraButtons={
        running
          ? [
              { label: "Accept", onClick: () => sendMissionAccept() },
              { label: "Cancel", onClick: () => sendMissionCancel() },
            ]
          : undefined
      }
      details={[
        { label: "Source", value: "mission.yaml" },
        { label: "Progress", value: "See MISSION log" },
        { label: "PID / Up", value: status === "running" ? "Running" : "--" },
      ]}
    />
  );
}
