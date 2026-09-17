"use client";

import { Camera, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGroundControl } from "../../useGroundControl";

export function CameraPanel() {
  const { cameraOpen, connStatus, startCamera, stopCamera } = useGroundControl();
  const connected = connStatus === "connected";

  return (
    <Card className="h-full overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="flex min-h-12 flex-row items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-100 bg-cyan-50 text-cyan-600">
            <Camera size={13} />
          </div>
          <div>
            <CardTitle className="text-[12px] font-black tracking-wide text-slate-700">
              CAMERA FEED
            </CardTitle>
            <p className="font-mono text-[9px] text-slate-400">
              SSH Port Forward · Local
            </p>
          </div>
        </div>
        <Button
          size="sm"
          disabled={!connected}
          onClick={() => (cameraOpen ? stopCamera() : startCamera())}
          className="h-9 gap-1.5 bg-slate-800 px-3 text-[10px] font-bold"
        >
          <Camera size={11} />
          {cameraOpen ? "Hide Camera" : "Show Camera"}
        </Button>
      </CardHeader>
      <CardContent className="p-3">
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-[#020817]">
          {cameraOpen ? (
            // MJPEG multipart stream -- next/image tidak kompatibel dengan
            // format ini, <img> mentah memang yang seharusnya dipakai di sini.
            <img
              src="http://localhost:8090/stream?topic=/camera/camera/color/image_raw"
              alt="Camera stream"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="max-w-[360px] px-6 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-slate-500">
                <WifiOff size={19} />
              </div>
              <div className="text-[12px] font-black tracking-wide text-slate-400">
                CAMERA TUNNEL CLOSED
              </div>
              <p className="mt-2 text-[10px] leading-6 text-slate-500">
                Video is not streamed over stdout. Ground Control establishes an
                SSH local port forward{" "}
                <span className="font-mono text-cyan-500">
                  (8090:localhost:8090)
                </span>{" "}
                to access the web_video_server.
              </p>
              {!connected && (
                <p className="mt-3 text-[10px] font-bold text-red-400">
                  Connect SSH first to open the camera port-forward.
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
