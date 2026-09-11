import { Flag } from "lucide-react";
import { ServiceCard } from "../service-card";

export function Mission() {
  return (
    <ServiceCard
      title="MISSION"
      badge="SSH"
      status="Stopped"
      icon={Flag}
      color="yellow"
      footer="SSH Required"
      action="Start"
      details={[
        { label: "Source", value: "mission.yaml" },
        { label: "Progress", value: "WP -- / 05" },
        { label: "PID / Up", value: "--" },
      ]}
    />
  );
}
