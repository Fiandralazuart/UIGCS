import { Satellite } from "lucide-react";
import { ServiceCard } from "../service-card";

export function Rtk() {
  return (
    <ServiceCard
      title="RTK"
      badge="LOCAL"
      status="Stopped"
      icon={Satellite}
      color="blue"
      footer="Laptop process"
      action="Start"
      details={[
        { label: "Fix Status", value: "NO FIX" },
        { label: "Sats / Rate", value: "0 sats · 0.0Hz" },
        { label: "Source", value: "NTRIP Caster" },
      ]}
    />
  );
}
