"use client";

import { Camera } from "./section/camera/camera";
import { CameraPanel } from "./section/camera-panel/camera-panel";
import { Header } from "./section/header/header";
import { Mission } from "./section/mission/mission";
import { MissionPanel } from "./section/mission-panel/mission-panel";
import { Logs } from "./section/logs/logs";
import { Mavros } from "./section/mavros/mavros";
import { Rtk } from "./section/rtk/rtk";
import { Telemetry } from "./section/telemetry/telemetry";
import { Vision } from "./section/vision/vision";

const GroundControl = () => {
  return (
    <main className="min-h-screen bg-[#edf4f9] text-slate-600">
      <Header />
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.75fr]">
          <CameraPanel />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Rtk />
            <Mavros />
            <Vision />
            <Mission />
            <Camera />
          </div>
        </section>
        <Telemetry />
        <section className="w-full">
          <MissionPanel />
        </section>
        <section className="w-full">
          <Logs />
        </section>
      </div>
    </main>
  );
};

export default GroundControl;
