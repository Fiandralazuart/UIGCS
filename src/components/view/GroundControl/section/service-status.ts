import type { ServiceStatus } from "../useGroundControl";

export function serviceDisplay(status: ServiceStatus): {
  label: string;
  color: "gray" | "green" | "yellow" | "red";
  action: string;
} {
  switch (status) {
    case "running":
      return { label: "Running", color: "green", action: "Stop" };
    case "starting":
      return { label: "Starting…", color: "yellow", action: "Starting…" };
    case "stopping":
      return { label: "Stopping…", color: "yellow", action: "Stopping…" };
    case "error":
      return { label: "Error", color: "red", action: "Start" };
    case "stopped":
    default:
      return { label: "Stopped", color: "gray", action: "Start" };
  }
}
