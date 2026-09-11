import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const waypoints = [
  ["01", "TAKEOFF", "5.0s", "2.0 m/s", "3.5m", "B1", "CLOSE", "FALSE"],
  ["02", "WAYPOINT", "8.0s", "3.5 m/s", "4.2m", "B1", "OPEN", "FALSE"],
  ["03", "WAYPOINT", "4.0s", "4.0 m/s", "4.5m", "B2", "CLOSE", "FALSE"],
  ["04", "WAYPOINT", "6.0s", "3.0 m/s", "3.8m", "B2", "OPEN", "FALSE"],
  ["05", "WAYPOINT", "10.0s", "1.5 m/s", "0.5m", "B3", "CLOSE", "TRUE"],
];

export function MissionPanel() {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="flex min-h-12 flex-row items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-yellow-100 bg-yellow-50 text-yellow-600">
            <Flag size={13} />
          </div>
          <div>
            <CardTitle className="text-[12px] font-black tracking-wide text-slate-700">
              MISSION EXECUTION & MISSION.YAML SYNC
            </CardTitle>
            <p className="font-mono text-[9px] text-slate-400">
              OLED writes to mission.yaml · Ground Control executes
              03_mission.launch.xml
            </p>
          </div>
        </div>
        <Button disabled size="sm" className="h-9 text-[10px] font-bold">
          Mission Start
        </Button>
      </CardHeader>
      <CardContent className="p-3">
        <div className="mb-3 rounded-lg border border-cyan-100 bg-cyan-50/40 p-3">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[9px]">
            <Badge
              variant="outline"
              className="border-yellow-200 bg-yellow-50 text-[8px] text-yellow-700"
            >
              DRONE OLED
            </Badge>
            <span className="text-slate-400">wp.launch.xml writes →</span>
            <Badge
              variant="outline"
              className="border-orange-200 bg-white text-[8px] text-orange-600"
            >
              mission.yaml
            </Badge>
            <span className="text-slate-400">→</span>
            <Badge
              variant="outline"
              className="border-slate-200 bg-white text-[8px] text-slate-600"
            >
              03_mission
            </Badge>
            <span className="text-slate-400">reads</span>
            <Badge className="bg-slate-800 text-[8px]">GROUND CONTROL</Badge>
          </div>
          <Separator className="my-2 bg-cyan-100" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-500">Status:</span>
            <span className="font-mono text-[9px] font-bold text-slate-600">
              STANDBY
            </span>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-100">
                {[
                  "WP#",
                  "TYPE",
                  "HOLD (s)",
                  "SPEED",
                  "ALT (m)",
                  "BATCH",
                  "GRIPPER",
                  "LAND",
                  "STATUS",
                ].map((head) => (
                  <th
                    key={head}
                    className="whitespace-nowrap px-2 py-2 text-[9px] font-black tracking-wide text-slate-400"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {waypoints.map((row) => (
                <tr
                  key={row[0]}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70"
                >
                  {row.map((value, index) => (
                    <td
                      key={`${row[0]}-${index}`}
                      className={`px-2 py-2 text-[10px] ${index === 0 ? "font-bold text-cyan-700" : index === 1 ? "font-bold text-cyan-700" : "font-mono"}`}
                    >
                      {index === 0 ? (
                        <Badge
                          variant="outline"
                          className="border-cyan-200 bg-cyan-50 px-2 text-[9px] text-cyan-700"
                        >
                          {value}
                        </Badge>
                      ) : (
                        value
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-[9px] font-bold text-slate-400">
                    PENDING
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
