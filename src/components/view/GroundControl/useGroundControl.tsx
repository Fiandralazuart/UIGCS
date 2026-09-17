"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ServiceName = "mavros" | "vision" | "mission" | "rtkRelay" | "lcd" | "livox" | "flightLogger";
export type ServiceStatus = "stopped" | "starting" | "running" | "stopping" | "error";
export type ConnStatus = "disconnected" | "connecting" | "connected" | "error";
export type MissionBuildStatus = "idle" | "building" | "success" | "error";

interface ServiceState {
  status: ServiceStatus;
  startedAt: number | null;
}

export interface WifiInterfaceSignal {
  iface: string;
  connected: boolean;
  ssid: string | null;
  signalDbm: number | null;
}

export interface TelemetryData {
  state?: { connected: boolean; armed: boolean; guided: boolean; mode: string; ts: number };
  localPose?: { x: number; y: number; z: number; ts: number };
  globalPose?: { lat: number; lon: number; alt: number; ts: number };
  vfrHud?: { groundspeed: number; altitude: number; climb: number; heading: number; ts: number };
  gpsRaw?: {
    fixType: number;
    satellitesVisible: number;
    hdop: number | null;
    vdop: number | null;
    ts: number;
  };
  // percentage dari FC ini SELALU 0.0 (tidak diisi firmware) -- header.tsx
  // sengaja HANYA menampilkan voltage/current, bukan percentage.
  battery?: { voltage: number; current: number; percentage: number; ts: number };
  // Deteksi obstacle 2D LATERAL (BUKAN 3D, BUKAN 1D) dari Livox Mid-360 --
  // FRONT/BACK/LEFT/RIGHT dalam cm, null kalau tidak ada titik valid di
  // sektor itu. Lihat livox_lateral_distance.py di raspi.
  livoxLateral?: {
    frontCm: number | null;
    backCm: number | null;
    leftCm: number | null;
    rightCm: number | null;
    ts: number;
  };
  // /fiducial/fps dipublish vision_pipeline (aruco.cpp, fps_monitor_) --
  // cuma ada isinya kalau service "vision" sedang jalan.
  fiducialFps?: { fps: number; ts: number };
  // Panel MAP -- attitude+gyro+accel AKTUAL dari /mavros/imu/data.
  imu?: {
    rollDeg: number;
    pitchDeg: number;
    yawDeg: number;
    gyroXDps: number;
    gyroYDps: number;
    gyroZDps: number;
    accelX: number;
    accelY: number;
    accelZ: number;
    ts: number;
  };
  // Attitude SETPOINT (target) -- dibandingkan dengan `imu` (aktual) buat
  // panel "PID setpoint vs aktual".
  attitudeTarget?: {
    rollDeg: number;
    pitchDeg: number;
    yawDeg: number;
    rollRateDps: number;
    pitchRateDps: number;
    yawRateDps: number;
    thrust: number;
    ts: number;
  };
  motorOut?: { channels: number[]; ts: number };
  estimatorStatus?: {
    attitude: boolean;
    velocityHoriz: boolean;
    velocityVert: boolean;
    posHorizRel: boolean;
    posHorizAbs: boolean;
    posVertAbs: boolean;
    posVertAgl: boolean;
    constPosMode: boolean;
    gpsGlitch: boolean;
    accelError: boolean;
    ts: number;
  };
  baro?: { pressureHpa: number; ts: number };
  // 2026-09-16 -- lihat komentar lengkap di TelemetryData ssh-manager.ts
  // (sisi server, tempat field ini pertama kali diisi dari /mavros/altitude).
  altitude?: {
    amsl: number | null;
    local: number | null;
    relative: number | null;
    terrain: number | null;
    bottomClearance: number | null;
    ts: number;
  };
}

const SSH_FORM_STORAGE_KEY = "gcs.sshForm";

const emptyService: ServiceState = { status: "stopped", startedAt: null };

interface GroundControlState {
  // --- SSH connection form + status ---
  host: string;
  // Backup IP (2026-09-16) -- dicoba OTOMATIS oleh connect() kalau host
  // utama gagal (mis. adaptor WiFi utamanya mati/tidak kedetect). Kosong =
  // fitur nonaktif.
  backupHost: string;
  port: number;
  username: string;
  password: string;
  setHost: (v: string) => void;
  setBackupHost: (v: string) => void;
  setPort: (v: number) => void;
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  connStatus: ConnStatus;
  connError: string | null;
  // IP yang BENAR-BENAR terpakai saat ini (host atau backupHost) -- null
  // kalau belum/tidak connected. Beda dari `host` kalau failover terjadi.
  activeHost: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // --- SSH-based services ---
  services: Record<ServiceName, ServiceState>;
  startService: (
    name: ServiceName,
    missionOpts?: { useRetryFile?: boolean },
  ) => Promise<void>;
  stopService: (name: ServiceName) => Promise<void>;

  // --- Mission keypress gate (accept = send "1", cancel = SIGINT via stopService) ---
  sendMissionAccept: () => Promise<void>;
  sendMissionCancel: () => Promise<void>;

  // --- Mission build (colcon build --packages-select waypoint_mission,
  // one-shot, output di-append ke logs.mission dengan prefix "[build]") ---
  missionBuildStatus: MissionBuildStatus;
  buildMission: () => Promise<void>;

  // --- Restart LCD (systemctl restart wp_trigger_controller.service di
  // raspi -- BEDA dari startService/stopService("lcd") yang cuma nge-tail
  // journalctl, ini restart proses OLED-nya sendiri) ---
  restartLcdDisplay: () => Promise<void>;

  // --- Waypoint coordinate: "Ambil WP" (capture GPS live, meniru ui_ws)
  // dan "Delete WP" -- status per-index buat animasi sukses/gagal. ---
  waypointCapture: Record<number, { status: "capturing" | "success" | "error"; message: string; ts: number }>;
  captureWaypoint: (
    index: number,
    params: {
      holdS: string;
      speedMps: string;
      altM: string;
      gripperOpen: boolean;
      batch?: string;
      land?: boolean;
      metadataOnly?: boolean;
    },
  ) => Promise<void>;
  deleteWaypointCoord: (index: number) => Promise<void>;
  // "Tambah WP" -- TANPA GPS sama sekali (atas permintaan user), cuma
  // menyisipkan placeholder WP baru di akhir daftar. Return status ok/error
  // supaya UI (mission-panel.tsx) bisa refresh tabel begitu sukses.
  addWaypoint: () => Promise<{ ok: boolean; error?: string }>;
  // "Reset" -- fungsi SAMA seperti RESET di LCD fisik (ui_ws): kosongkan
  // SELURUH waypoint di mission.yaml, param lain dipertahankan.
  resetAllWaypoints: () => Promise<{ ok: boolean; error?: string }>;
  // Retry Mission (2026-09-16, REVISI): bangun ULANG mission_retry.yaml
  // dari mission.yaml TERBARU (WP1 + batch target, label marker batch
  // dipertahankan apa adanya) -- WAJIB dipanggil & sukses SEBELUM
  // startService("mission", {useRetryFile:true}).
  buildRetryMission: (batch: number) => Promise<{ ok: boolean; error?: string }>;
  // "Ambil WP1 Retry" (2026-09-16, web + LCD fisik) -- ambil ulang posisi
  // GPS SEKARANG sebagai titik takeoff Retry Mission, ditulis ke WP1
  // mission_retry.yaml (BUKAN mission.yaml asli). Caller WAJIB suplai
  // params dari WP1 ASLI (mission-panel.tsx pakai waypoints[0]).
  captureRetryWp1: (params: {
    holdS: string;
    speedMps: string;
    altM: string;
    gripperOpen: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;

  // --- Gripper open/close (kartu LCD & GRIPPER, publish sekali ke
  // /gripper_cmd) ---
  sendGripperCommand: (cmd: "open" | "close") => Promise<{ ok: boolean; error?: string }>;

  // --- WiFi signal (2 adaptor raspi: wlan0 + TP-Link USB), dipoll berkala
  // untuk indikator dBm di header ---
  wifiSignal: WifiInterfaceSignal[];

  // --- Live telemetry (auto-started server-side alongside mavros) ---
  telemetry: TelemetryData;

  // --- Camera local port-forward (SSH-based, but not a "service" process) ---
  cameraOpen: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => Promise<void>;

  // --- RTK (runs LOCALLY on this laptop, independent of SSH) ---
  rtk: ServiceState;
  // runner (2026-09-16): "udp" (default) = rtk_base_forward.py/
  // rtk_rover_relay.py (Python/UDP, broadcast). "str2str" = RTKLIB, TCP
  // client/server ke SATU IP (activeHost/host, otomatis).
  startRtk: (runner?: "udp" | "str2str") => Promise<void>;
  stopRtk: () => Promise<void>;

  // --- Logs (polled from backend, keyed by tab) ---
  logs: {
    mavros: string[];
    visionCamera: string[];
    mission: string[];
    rtk: string[];
    lcd: string[];
    livox: string[];
    wpc: string[];
    flightLogger: string[];
  };
}

const GroundControlContext = createContext<GroundControlState | null>(null);

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `Request gagal (${res.status})`);
  }
  return data;
}

// host SENGAJA kosong ("") -- dulu ada default hardcode "192.168.1.104"
// tapi itu SALAH/bukan IP raspi yang benar (dilaporkan user 2026-09-15),
// dan nebak IP spesifik apa pun berisiko sama: salah lagi di jaringan lain.
// Operator WAJIB isi + klik "Simpan IP" sendiri sekali di ConnectPanel;
// sesudah itu localStorage yang jadi sumber kebenaran, host TIDAK PERNAH
// di-set otomatis oleh kode di luar aksi eksplisit itu.
// backupHost (2026-09-16, atas permintaan user): raspi punya 2 adaptor
// WiFi/IP (lihat WifiInterfaceSignal) -- kalau adaptor utama (host) gagal
// konek/tidak kedetect, connect() otomatis coba backupHost sebelum
// menyerah. Kosong ("") = fitur tidak aktif (perilaku lama, cuma coba host
// utama), sama seperti host sendiri TIDAK di-default ke IP tertentu.
const FALLBACK_SSH_FORM = { host: "", backupHost: "", port: 22, username: "vtol" };

// Dulu ini lazy initializer yang langsung baca localStorage saat state
// pertama dibuat -- kelihatannya SSR-safe (window undefined -> fallback),
// tapi ternyata BUKAN: initializer itu juga jalan lagi saat CLIENT render
// pertama kali SEBELUM hydration selesai, dan window/localStorage SUDAH ada
// di titik itu -- jadi HTML dari server (fallback) vs HTML yang React coba
// cocokkan di client (nilai localStorage) beda -> hydration mismatch
// (dikonfirmasi lewat error React "server rendered text didn't match the
// client" pada host:port di header). Fix: render pertama SELALU pakai
// fallback (sama persis di server & client), baru baca localStorage lewat
// useEffect (jalan HANYA di client, SETELAH hydration selesai) dan
// setState kalau nilainya beda -- itu sebabnya bukan lazy initializer lagi.
function readStoredSshForm(): typeof FALLBACK_SSH_FORM | null {
  try {
    const raw = window.localStorage.getItem(SSH_FORM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<typeof FALLBACK_SSH_FORM>;
    return {
      host: parsed.host || FALLBACK_SSH_FORM.host,
      backupHost: parsed.backupHost || FALLBACK_SSH_FORM.backupHost,
      port: parsed.port || FALLBACK_SSH_FORM.port,
      username: parsed.username || FALLBACK_SSH_FORM.username,
    };
  } catch {
    return null;
  }
}

export function GroundControlProvider({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState(FALLBACK_SSH_FORM.host);
  const [backupHost, setBackupHost] = useState(FALLBACK_SSH_FORM.backupHost);
  const [port, setPort] = useState(FALLBACK_SSH_FORM.port);
  const [username, setUsername] = useState(FALLBACK_SSH_FORM.username);
  const [password, setPassword] = useState("");
  // Diisi "host" atau "backupHost" begitu connect() berhasil, supaya UI
  // bisa menunjukkan IP MANA yang benar-benar dipakai kalau failover ke
  // backupHost terjadi (host utama gagal).
  const [activeHost, setActiveHost] = useState<string | null>(null);

  const [connStatus, setConnStatus] = useState<ConnStatus>("disconnected");
  const [connError, setConnError] = useState<string | null>(null);
  // Guard hydration: TIDAK ada bukti konkret di kode ini yang bikin
  // connStatus beda antara SSR & first client render (initial value-nya
  // sama-sama literal "disconnected") -- tapi mismatch ini TERBUKTI
  // berulang kali dilaporkan user 2026-09-14 walau .next cache sudah
  // dibersihkan total + dev server di-restart bersih, jadi kemungkinan
  // besar artefak Next.js dev-mode/Fast Refresh yang di luar kendali kode
  // ini. `mounted` MEMAKSA setiap konsumen connStatus (lewat
  // effectiveConnStatus di bawah) SELALU melihat "disconnected" pada
  // render pertama (SSR dan first client paint, keduanya identik), baru
  // switch ke nilai asli SETELAH mount -- pola standar React/Next.js buat
  // state yang secara inheren client-only, menghilangkan KEMUNGKINAN
  // mismatch sama sekali, apa pun akar penyebab sebenarnya.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // setTimeout(fn, 0) alih-alih manggil setMounted() langsung -- pola
    // sama seperti effect lain di file ini, menghindari "setState sinkron
    // di dalam effect" yang bikin render cascade.
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);
  const effectiveConnStatus: ConnStatus = mounted ? connStatus : "disconnected";

  const [telemetry, setTelemetry] = useState<TelemetryData>({});

  const [services, setServices] = useState<Record<ServiceName, ServiceState>>({
    mavros: emptyService,
    vision: emptyService,
    mission: emptyService,
    rtkRelay: emptyService,
    lcd: emptyService,
    livox: emptyService,
    flightLogger: emptyService,
  });
  const [cameraOpen, setCameraOpen] = useState(false);
  // Status proses LOKAL (laptop, rtk_base_forward.py) -- sisi raspi ada di
  // services.rtkRelay di atas. RTK sebagai fitur = KEDUANYA harus jalan
  // bareng, lihat startRtk()/stopRtk() di bawah.
  const [rtk, setRtk] = useState<ServiceState>(emptyService);
  const [missionBuildStatus, setMissionBuildStatus] = useState<MissionBuildStatus>("idle");
  const [waypointCapture, setWaypointCapture] = useState<
    Record<number, { status: "capturing" | "success" | "error"; message: string; ts: number }>
  >({});

  const [logs, setLogs] = useState<GroundControlState["logs"]>({
    mavros: [],
    visionCamera: [],
    mission: [],
    rtk: [],
    lcd: [],
    livox: [],
    wpc: [],
    flightLogger: [],
  });
  // Camera tunnel open/close events, client-side only (tunnel itself has no
  // remote log stream) -- merged into the VISION/CAMERA tab display.
  const cameraEventsRef = useRef<string[]>([]);

  // BUG NYATA ditemukan 2026-09-16 (dilaporkan user: IP selalu "hilang"
  // stiap refresh walau sudah "Simpan IP"): effect save di bawah jalan
  // juga saat MOUNT PERTAMA (host masih "" fallback di titik itu, restore
  // effect ini baru BENERAN mengisi host lewat setTimeout(0) -- macrotask
  // TERPISAH, jalan SETELAH effect save sempat commit duluan). Urutannya
  // dulu: mount -> restore effect jadwalkan setTimeout -> save effect
  // jalan SINKRON, nimpa localStorage dengan {host:"",...} -- localStorage
  // yang BENAR (hasil "Simpan IP" sesi sebelumnya) ke-timpa KOSONG duluan
  // sebelum sempat dibaca balik. Efeknya IP tersimpan selalu hilang lagi
  // tiap refresh. hydratedRef mencegah save effect menulis apa pun SEBELUM
  // restore ini benar-benar selesai (baik ketemu data maupun tidak).
  const hydratedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      const stored = readStoredSshForm();
      if (stored) {
        setHost(stored.host);
        setBackupHost(stored.backupHost);
        setPort(stored.port);
        setUsername(stored.username);
      }
      hydratedRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(
        SSH_FORM_STORAGE_KEY,
        JSON.stringify({ host, backupHost, port, username }),
      );
    } catch {
      // abaikan
    }
  }, [host, backupHost, port, username]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ssh/status");
      if (!res.ok) return;
      const data = await res.json();
      setConnStatus((prev) => {
        if (data.ssh.connecting) return "connecting";
        return data.ssh.connected ? "connected" : prev === "connecting" ? "connecting" : "disconnected";
      });
      setServices(data.ssh.services);
      setCameraOpen(Boolean(data.ssh.cameraOpen));
      setRtk(data.rtk);
      if (data.ssh.missionBuild) setMissionBuildStatus(data.ssh.missionBuild);
      if (data.ssh.waypointCapture) setWaypointCapture(data.ssh.waypointCapture);
    } catch {
      // Server belum siap / network blip -- polling berikutnya coba lagi.
    }
  }, []);

  const refreshLogs = useCallback(async () => {
    const fetchOne = async (service: string) => {
      try {
        const res = await fetch(`/api/logs?service=${service}`);
        if (!res.ok) return [] as string[];
        const data = await res.json();
        return (data.lines as string[]) ?? [];
      } catch {
        return [] as string[];
      }
    };
    const [mavros, vision, mission, rtkLocalLogs, rtkRelayLogs, lcd, livox, wpc, flightLogger] =
      await Promise.all([
        fetchOne("mavros"),
        fetchOne("vision"),
        fetchOne("mission"),
        fetchOne("rtk"),
        fetchOne("rtkRelay"),
        fetchOne("lcd"),
        fetchOne("livox"),
        fetchOne("wpc"),
        fetchOne("flightLogger"),
      ]);
    setLogs((prev) => ({
      ...prev,
      mavros,
      mission,
      lcd,
      livox,
      wpc,
      flightLogger,
      // RTK sebagai fitur = 2 proses (laptop + raspi) -- log-nya digabung
      // jadi satu tab (sama polanya dengan VISION/CAMERA di bawah), TAPI
      // masing-masing baris diberi prefix [laptop]/[raspi] supaya tetap
      // jelas asalnya dari sisi mana.
      rtk: [
        ...rtkLocalLogs.map((line) => `[laptop] ${line}`),
        ...rtkRelayLogs.map((line) => `[raspi] ${line}`),
      ],
      visionCamera: [...vision, ...cameraEventsRef.current],
    }));
  }, []);

  const refreshTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/telemetry");
      if (!res.ok) return;
      const data = (await res.json()) as TelemetryData;
      setTelemetry(data);
    } catch {
      // polling berikutnya coba lagi
    }
  }, []);

  const [wifiSignal, setWifiSignal] = useState<WifiInterfaceSignal[]>([]);
  const refreshWifiSignal = useCallback(async () => {
    try {
      const res = await fetch("/api/ssh/wifi-signal");
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) setWifiSignal(data.interfaces);
    } catch {
      // polling berikutnya coba lagi
    }
  }, []);

  useEffect(() => {
    // setTimeout(fn, 0) alih-alih manggil refreshStatus()/refreshLogs()
    // langsung -- effect ini murni "subscribe ke polling", eksekusi
    // pertamanya dijadwalkan lewat task queue yang sama dengan
    // setInterval di bawah (bukan dieksekusi sinkron di badan effect).
    const initialStatusTimer = setTimeout(refreshStatus, 0);
    const initialLogsTimer = setTimeout(refreshLogs, 0);
    const initialTelemetryTimer = setTimeout(refreshTelemetry, 0);
    const statusTimer = setInterval(refreshStatus, 2000);
    const logsTimer = setInterval(refreshLogs, 2000);
    const telemetryTimer = setInterval(refreshTelemetry, 1000);
    return () => {
      clearTimeout(initialStatusTimer);
      clearTimeout(initialLogsTimer);
      clearTimeout(initialTelemetryTimer);
      clearInterval(statusTimer);
      clearInterval(logsTimer);
      clearInterval(telemetryTimer);
    };
  }, [refreshStatus, refreshLogs, refreshTelemetry]);

  // WiFi signal (2 adaptor raspi) -- cuma di-poll saat SSH connected (butuh
  // exec `iw dev ... link` x2 tiap kali, lebih berat dari sekadar baca
  // state lokal) -- interval lebih jarang (5s) dari status/logs (2s).
  useEffect(() => {
    if (connStatus !== "connected") return;
    const initialTimer = setTimeout(refreshWifiSignal, 0);
    const timer = setInterval(refreshWifiSignal, 5000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [connStatus, refreshWifiSignal]);

  // Auto-reconnect (2026-09-17, atas permintaan user: "jika monitoring
  // dari ip 1 terputus otomatis ganti ke ip ke 2"): failover di connect()
  // di bawah SEBELUMNYA cuma jalan kalau operator klik tombol Connect
  // manual -- kalau koneksi yang SUDAH terhubung putus SENDIRI di tengah
  // jalan (adaptor WiFi mati, raspi reboot, dst -- terdeteksi lewat
  // refreshStatus() polling 2s berubah dari "connected" ke "disconnected"),
  // TIDAK ada apa pun yang otomatis mencoba lagi, operator harus klik
  // Connect manual. userDisconnectedRef membedakan "putus sendiri" (harus
  // auto-reconnect) dari "user klik Disconnect" (JANGAN auto-reconnect --
  // itu tindakan sengaja). wasConnectedRef mencegah trigger di transisi
  // awal "disconnected"->"disconnected" (sebelum pernah connect sama
  // sekali).
  const userDisconnectedRef = useRef(false);
  const wasConnectedRef = useRef(false);

  // Failover (2026-09-16, atas permintaan user): kalau host UTAMA gagal
  // konek (mis. adaptor WiFi-nya mati/tidak kedetect) DAN backupHost
  // terisi, otomatis coba backupHost sebelum benar-benar menyerah --
  // TIDAK perlu operator switch IP manual di tengah kepanikan. activeHost
  // dicatat supaya UI bisa menunjukkan IP mana yang benar-benar terpakai.
  const connect = useCallback(async () => {
    userDisconnectedRef.current = false;
    setConnStatus("connecting");
    setConnError(null);
    try {
      await postJson("/api/ssh/connect", { host, port, username, password });
      setActiveHost(host);
      setConnStatus("connected");
      return;
    } catch (primaryErr) {
      if (!backupHost.trim()) {
        setConnStatus("error");
        setConnError(primaryErr instanceof Error ? primaryErr.message : String(primaryErr));
        return;
      }
      console.warn(`Host utama ${host} gagal konek, mencoba backup ${backupHost}...`);
    }
    try {
      await postJson("/api/ssh/connect", { host: backupHost, port, username, password });
      setActiveHost(backupHost);
      setConnStatus("connected");
    } catch (backupErr) {
      setConnStatus("error");
      setConnError(
        `Host utama & backup sama-sama gagal konek -- backup (${backupHost}): ${
          backupErr instanceof Error ? backupErr.message : String(backupErr)
        }`,
      );
    }
  }, [host, backupHost, port, username, password]);

  const disconnect = useCallback(async () => {
    // Ditandai SEBELUM await -- operator SENGAJA memutus, auto-reconnect
    // effect di bawah harus diam, bukan langsung nyambung lagi.
    userDisconnectedRef.current = true;
    try {
      await postJson("/api/ssh/disconnect");
    } catch (err) {
      console.error("disconnect gagal:", err);
    }
    setConnStatus("disconnected");
    setActiveHost(null);
    setServices({
      mavros: emptyService,
      vision: emptyService,
      mission: emptyService,
      rtkRelay: emptyService,
      lcd: emptyService,
      livox: emptyService,
      flightLogger: emptyService,
    });
    setCameraOpen(false);
  }, []);

  // Auto-reconnect effect (2026-09-17) -- lihat catatan userDisconnectedRef/
  // wasConnectedRef di atas. Dipicu murni dari transisi connStatus hasil
  // polling refreshStatus() (2s), BUKAN dari aksi manual apa pun. Cuma
  // SATU siklus percobaan (host lalu backupHost, persis logic connect())
  // per drop -- kalau raspi BENAR-BENAR mati/keduanya gagal, connect() akan
  // set status "error" dan effect ini TIDAK retry terus-menerus (mencegah
  // spam reconnect kalau memang belum ada apa pun yang bisa dihubungi).
  useEffect(() => {
    if (connStatus === "connected") {
      wasConnectedRef.current = true;
      return;
    }
    if (
      connStatus === "disconnected" &&
      wasConnectedRef.current &&
      !userDisconnectedRef.current
    ) {
      wasConnectedRef.current = false;
      console.warn("Koneksi SSH terputus sendiri -- mencoba reconnect otomatis (host lalu backup)...");
      connect();
    }
  }, [connStatus, connect]);

  // catch di sini SENGAJA cuma log ke console, TIDAK dilempar ulang --
  // tombol Start/Stop dipanggil langsung dari onClick tanpa .catch() di
  // pemanggilnya (mis. `onClick={() => stopService("mavros")}`), jadi
  // promise yang reject di sini jadi unhandled rejection yang bikin Next.js
  // dev overlay "Runtime Error" muncul (TERBUKTI kejadian nyata 2026-09-14,
  // mis. klik Stop MAVROS padahal MAVROS memang sudah tidak jalan -- error
  // dari API "mavros tidak sedang berjalan" itu WAJAR, bukan bug). Status
  // sebenarnya (termasuk lastError kalau ada) tetap kelihatan lewat
  // refreshStatus() di bawah, jadi tidak perlu dilempar lagi ke pemanggil.
  const startService = useCallback(
    async (name: ServiceName, missionOpts?: { useRetryFile?: boolean }) => {
      try {
        await postJson("/api/ssh/service", { service: name, action: "start", missionOpts });
      } catch (err) {
        console.error(`startService(${name}) gagal:`, err);
      } finally {
        refreshStatus();
      }
    },
    [refreshStatus],
  );

  const stopService = useCallback(async (name: ServiceName) => {
    try {
      await postJson("/api/ssh/service", { service: name, action: "stop" });
    } catch (err) {
      console.error(`stopService(${name}) gagal:`, err);
    } finally {
      refreshStatus();
    }
  }, [refreshStatus]);

  // Accept = kirim "1" ke gerbang keypress mission_node.cpp (butuh pty,
  // sudah dijamin backend saat start mission). Cancel = SIGINT biasa lewat
  // stopService, sama seperti tombol Stop -- mission_node.cpp sudah
  // menangani SIGINT sebagai request_emergency_land().
  const sendMissionAccept = useCallback(async () => {
    try {
      await postJson("/api/ssh/mission-key", { key: "1" });
    } catch (err) {
      console.error("sendMissionAccept gagal:", err);
    }
  }, []);

  const sendMissionCancel = useCallback(async () => {
    await stopService("mission");
  }, [stopService]);

  // colcon build --packages-select waypoint_mission (one-shot, lihat
  // buildMission() di ssh-manager.ts) -- statusnya di-sync balik lewat
  // refreshStatus() (polling 2s), setelah call ini cuma set optimistic
  // "building" supaya tombol langsung disabled tanpa nunggu polling.
  const buildMission = useCallback(async () => {
    setMissionBuildStatus("building");
    try {
      await postJson("/api/ssh/mission-build", {});
    } catch (err) {
      console.error("buildMission gagal:", err);
    }
  }, []);

  const restartLcdDisplay = useCallback(async () => {
    try {
      await postJson("/api/ssh/lcd-restart", {});
    } catch (err) {
      console.error("restartLcdDisplay gagal:", err);
    } finally {
      refreshLogs();
    }
  }, [refreshLogs]);

  // "Ambil WP"/"Tambah WP" -- meniru PERSIS pola ui_ws (LCD fisik), lihat
  // captureWaypoint() di ssh-manager.ts. Optimistic-mark "capturing" di sini
  // (supaya animasi langsung muncul tanpa nunggu polling 2s), status
  // final (success/error) di-sync balik lewat refreshStatus().
  const captureWaypoint = useCallback(
    async (
      index: number,
      params: {
        holdS: string;
        speedMps: string;
        altM: string;
        gripperOpen: boolean;
        batch?: string;
        land?: boolean;
        metadataOnly?: boolean;
      },
    ) => {
      setWaypointCapture((prev) => ({
        ...prev,
        [index]: {
          status: "capturing",
          message: params.metadataOnly ? "Menyimpan metadata WP..." : "Mengambil posisi GPS...",
          ts: Date.now(),
        },
      }));
      try {
        await postJson("/api/mission/waypoint/capture", { index, ...params });
      } catch (err) {
        console.error(`captureWaypoint(${index}) gagal:`, err);
      }
    },
    [],
  );

  const deleteWaypointCoord = useCallback(async (index: number) => {
    try {
      await postJson("/api/mission/waypoint/delete", { index });
    } catch (err) {
      console.error(`deleteWaypointCoord(${index}) gagal:`, err);
    }
  }, []);

  const addWaypoint = useCallback(async () => {
    try {
      await postJson("/api/mission/waypoint/add");
      return { ok: true };
    } catch (err) {
      console.error("addWaypoint() gagal:", err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const resetAllWaypoints = useCallback(async () => {
    try {
      await postJson("/api/mission/waypoint/reset-all");
      return { ok: true };
    } catch (err) {
      console.error("resetAllWaypoints() gagal:", err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const buildRetryMission = useCallback(async (batch: number) => {
    try {
      await postJson("/api/mission/build-retry", { batch });
      return { ok: true };
    } catch (err) {
      console.error(`buildRetryMission(${batch}) gagal:`, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const captureRetryWp1 = useCallback(
    async (params: { holdS: string; speedMps: string; altM: string; gripperOpen: boolean }) => {
      setWaypointCapture((prev) => ({
        ...prev,
        0: { status: "capturing", message: "Mengambil posisi GPS...", ts: Date.now() },
      }));
      try {
        await postJson("/api/mission/waypoint/capture-retry-wp1", params);
        return { ok: true };
      } catch (err) {
        console.error("captureRetryWp1() gagal:", err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [],
  );

  const sendGripperCommand = useCallback(async (cmd: "open" | "close") => {
    try {
      await postJson("/api/mission/gripper", { cmd });
      return { ok: true };
    } catch (err) {
      console.error(`sendGripperCommand(${cmd}) gagal:`, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      await postJson("/api/ssh/camera", { action: "start" });
      cameraEventsRef.current = [
        ...cameraEventsRef.current,
        "[camera] Tunnel dibuka (localhost:8090 -> raspi:8090).",
      ];
    } catch (err) {
      cameraEventsRef.current = [
        ...cameraEventsRef.current,
        `[camera] Gagal membuka tunnel: ${err instanceof Error ? err.message : String(err)}`,
      ];
    } finally {
      refreshStatus();
    }
  }, [refreshStatus]);

  const stopCamera = useCallback(async () => {
    try {
      await postJson("/api/ssh/camera", { action: "stop" });
      cameraEventsRef.current = [...cameraEventsRef.current, "[camera] Tunnel ditutup."];
    } catch (err) {
      cameraEventsRef.current = [
        ...cameraEventsRef.current,
        `[camera] Gagal menutup tunnel: ${err instanceof Error ? err.message : String(err)}`,
      ];
    } finally {
      refreshStatus();
    }
  }, [refreshStatus]);

  // RTK = 2 proses terpisah (laptop + raspi) yang harus jalan bareng --
  // start/stop laptop selalu dicoba; sisi raspi (rtkRelay) cuma dicoba
  // kalau SSH sedang connected (kalau tidak, laptop tetap jalan sendirian,
  // mengirim RTCM ke tujuan yang -- untuk saat ini -- tidak ada yang
  // dengarkan di raspi).
  // runner (2026-09-16, atas permintaan user): "udp" (default, perilaku
  // lama TIDAK berubah) atau "str2str" (RTKLIB) -- dest laptop-side str2str
  // OTOMATIS pakai activeHost (IP raspi yang BENAR-BENAR sedang connected
  // sekarang, termasuk kalau lagi failover ke backupHost), operator tidak
  // perlu isi manual.
  const startRtk = useCallback(
    async (runner: "udp" | "str2str" = "udp") => {
      try {
        const tasks: Promise<unknown>[] = [
          postJson("/api/rtk", { action: "start", runner, dest: activeHost ?? host }),
        ];
        if (connStatus === "connected") {
          tasks.push(
            postJson("/api/ssh/service", {
              service: "rtkRelay",
              action: "start",
              missionOpts: { rtkRunner: runner },
            }),
          );
        }
        await Promise.allSettled(tasks);
      } finally {
        refreshStatus();
      }
    },
    [connStatus, activeHost, host, refreshStatus],
  );

  const stopRtk = useCallback(async () => {
    try {
      const tasks: Promise<unknown>[] = [postJson("/api/rtk", { action: "stop" })];
      if (connStatus === "connected") {
        tasks.push(
          postJson("/api/ssh/service", { service: "rtkRelay", action: "stop" }),
        );
      }
      await Promise.allSettled(tasks);
    } finally {
      refreshStatus();
    }
  }, [connStatus, refreshStatus]);

  const value: GroundControlState = {
    host,
    backupHost,
    port,
    username,
    password,
    setHost,
    setBackupHost,
    setPort,
    setUsername,
    setPassword,
    connStatus: effectiveConnStatus,
    connError,
    activeHost,
    connect,
    disconnect,
    services,
    startService,
    stopService,
    sendMissionAccept,
    sendMissionCancel,
    missionBuildStatus,
    buildMission,
    restartLcdDisplay,
    waypointCapture,
    captureWaypoint,
    deleteWaypointCoord,
    addWaypoint,
    resetAllWaypoints,
    buildRetryMission,
    captureRetryWp1,
    sendGripperCommand,
    wifiSignal,
    telemetry,
    cameraOpen,
    startCamera,
    stopCamera,
    rtk,
    startRtk,
    stopRtk,
    logs,
  };

  return (
    <GroundControlContext.Provider value={value}>{children}</GroundControlContext.Provider>
  );
}

export function useGroundControl(): GroundControlState {
  const ctx = useContext(GroundControlContext);
  if (!ctx) {
    throw new Error("useGroundControl() must be used inside <GroundControlProvider>.");
  }
  return ctx;
}
