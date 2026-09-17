"use client";

import { useState } from "react";
import { LayoutDashboard, Map as MapIcon } from "lucide-react";
import { CameraPanel } from "./section/camera-panel/camera-panel";
import { Header } from "./section/header/header";
import { LcdTrigger } from "./section/lcd-trigger/lcd-trigger";
import { Livox } from "./section/livox/livox";
import { Mission } from "./section/mission/mission";
import { MissionPanel } from "./section/mission-panel/mission-panel";
import { Logs } from "./section/logs/logs";
import { Mavros } from "./section/mavros/mavros";
import { Rtk } from "./section/rtk/rtk";
import { Telemetry } from "./section/telemetry/telemetry";
import { Vision } from "./section/vision/vision";
import { MapView } from "./section/map/map-view";
import { GroundControlProvider } from "./useGroundControl";

type TopTab = "dashboard" | "map";

const TABS: { key: TopTab; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "DASHBOARD", icon: LayoutDashboard },
  { key: "map", label: "MAP", icon: MapIcon },
];

const GroundControl = () => {
  const [activeTab, setActiveTab] = useState<TopTab>("dashboard");

  return (
    <GroundControlProvider>
      <main className="min-h-screen bg-[#edf4f9] text-slate-600">
        <Header />
        <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
          <div
            className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
            role="tablist"
            aria-label="Ground Control view"
          >
            {TABS.map(({ key, label, icon: Icon }) => {
              const isActive = key === activeTab;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(key)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-black tracking-wide transition-colors ${
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}
          </div>

          {activeTab === "dashboard" && (
            <div className="space-y-4">
              <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.75fr]">
                <CameraPanel />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Rtk />
                  <Mavros />
                  <Vision />
                  <Mission />
                  <LcdTrigger />
                  <Livox />
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
          )}

          {activeTab === "map" && <MapView />}
        </div>
      </main>
    </GroundControlProvider>
  );
};

export default GroundControl;
