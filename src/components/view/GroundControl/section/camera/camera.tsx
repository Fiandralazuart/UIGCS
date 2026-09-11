import { Camera as CameraIcon } from "lucide-react";
import { ServiceCard } from "../service-card";

export function Camera() {
  return (
    <ServiceCard
      title="CAMERA"
      badge="TUNNEL"
      status="Closed"
      icon={CameraIcon}
      color="cyan"
      footer="SSH Required"
      action="Show"
      details={[
        { label: "Local Port", value: "localhost:8090" },
        { label: "Stream", value: "MJPEG / HTTP" },
        { label: "Frame Rate", value: "0 FPS" },
      ]}
    />
  );
}
