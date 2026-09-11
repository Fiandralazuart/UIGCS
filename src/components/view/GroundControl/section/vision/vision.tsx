import { Crosshair } from "lucide-react";
import { ServiceCard } from "../service-card";

export function Vision() {
  return (
    <ServiceCard
      title="VISION"
      badge="SSH"
      status="Stopped"
      icon={Crosshair}
      color="purple"
      footer="SSH Required"
      action="Start"
      details={[
        { label: "Pipeline", value: "vision_pipeline" },
        { label: "Remote PID", value: "--" },
        { label: "Uptime", value: "Idle" },
      ]}
    />
  );
}
