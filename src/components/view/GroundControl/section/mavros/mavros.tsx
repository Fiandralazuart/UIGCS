import { Terminal } from "lucide-react";
import { ServiceCard } from "../service-card";

export function Mavros() {
  return (
    <ServiceCard
      title="MAVROS"
      badge="SSH"
      status="Stopped"
      icon={Terminal}
      color="gray"
      footer="SSH Required"
      action="Start"
      details={[
        { label: "Remote PID", value: "--" },
        { label: "FCU Link", value: "No link" },
        { label: "Uptime", value: "--" },
      ]}
    />
  );
}
