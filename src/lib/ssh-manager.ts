// Server-only module -- NEVER import this from a "use client" component.
// Holds one persistent SSH connection (module-level singleton, lives as
// long as the Next.js server process) to the raspi, used by every
// SSH-based service (MAVROS/VISION/MISSION/RTK-relay) plus the camera
// local port-forward. The LAPTOP half of RTK (rtk_base_forward.py) is NOT
// here -- it runs locally, no SSH involved, see rtk-manager.ts. "rtkRelay"
// below is the RASPI half (rtk_rover_relay.py) -- RTK as a whole feature
// needs BOTH halves running together, wired from useGroundControl.tsx.
//
// 2026-09-14: str2str (RTKLIB, TCP) sempat dicoba beberapa kali -- root
// cause kegagalan awalnya ketemu & diperbaiki (serial path hardcoded
// /dev/ttyACM0 pecah kalau device F9P re-enumerasi; diperbaiki pakai
// resolve /dev/serial/by-id/... ke nama node bare tiap start), dan
// str2str SEMPAT diverifikasi stabil (90+ detik, RTK Float tercapai).
// TAPI atas permintaan user, dibalikkan lagi ke rtk_base_forward.py/
// rtk_rover_relay.py (custom Python/UDP, desain
// https://github.com/arilix/rtk-base). Binary str2str TIDAK dihapus dari
// raspi (~/rtk_gateway/raspi/str2str) kalau nanti mau dicoba lagi.

import { Client, type ClientChannel } from "ssh2";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseMissionYaml } from "./mission-yaml";

// "telemetry" dan "mjpegStreamer" bukan kartu/tombol sendiri di UI --
// auto-start/stop mengikuti service lain (telemetry -> mavros, mjpegStreamer
// -> vision, lihat cascade di startService()'s onExec). Dibuat ServiceName
// juga supaya reuse infrastruktur streams/logs yang sama. "livox" PUNYA
// kartu sendiri di UI (dulu placeholder disabled, sekarang aktif).
// "wpc" (Waypoint Coordinate) juga log-only, sama seperti telemetry/
// mjpegStreamer -- bukan service start/stop, cuma dipakai reuse
// infrastruktur logs supaya "Ambil WP"/"Tambah WP"/"Delete WP" (dulu
// numpang di logs.mission dengan prefix [ambilwp]/[addwp]/[deletewp])
// punya tab log SENDIRI, terpisah dari log start/stop/build mission.
export type ServiceName =
  | "mavros" | "vision" | "mission" | "rtkRelay" | "telemetry" | "lcd" | "mjpegStreamer"
  | "livox" | "wpc" | "flightLogger";
export type ServiceStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export interface ServiceState {
  status: ServiceStatus;
  startedAt: number | null;
  lastError: string | null;
}

// Opsi khusus Retry Mission (2026-09-16) -- cuma dipakai startService("mission").
// rtkRunner (2026-09-16) -- cuma dipakai startService("rtkRelay"): "udp"
// (default, rtk_rover_relay.py) atau "str2str" (RTKLIB, TCP server).
// Digabung satu interface (bukan dipisah per-service) supaya
// startService()/commandFor() cukup 1 parameter opts generik.
export interface MissionStartOpts {
  // Retry Mission (2026-09-16, REVISI) -- true = jalankan 03_mission.launch.xml
  // dengan config:=mission_retry.yaml (dibangun ulang oleh buildRetryMission()
  // SESAAT sebelum ini, lihat commandFor()) alih-alih start_batch:=/
  // retry_takeoff:= (dihapus atas permintaan user).
  useRetryFile?: boolean;
  rtkRunner?: "udp" | "str2str";
}

export interface ConnectionInfo {
  host: string;
  port: number;
  username: string;
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
  // percentage dari FC ini SELALU 0.0 (tidak diisi firmware) -- tetap
  // disimpan apa adanya, header.tsx sengaja HANYA menampilkan voltage/
  // current (data yang benar-benar terisi), bukan percentage.
  battery?: { voltage: number; current: number; percentage: number; ts: number };
  // Deteksi obstacle 2D LATERAL (BUKAN 3D point cloud, BUKAN 1D single-beam)
  // dari Livox Mid-360 -- 4 arah FRONT/BACK/LEFT/RIGHT, satuan cm, null
  // kalau tidak ada titik valid di sektor itu (di luar jangkauan/z-band).
  // Lihat livox_lateral_distance.py -- raw UDP langsung, TIDAK ada ROS2/
  // topic/domain sama sekali, murni "mendeteksi jarak aja".
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
  // Panel MAP (2026-09-14) -- attitude+gyro+accel AKTUAL dari /mavros/imu/data
  // (quaternion sudah dikonversi ke roll/pitch/yaw derajat di
  // telemetry_bridge.py, bukan di sini).
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
  // Attitude SETPOINT (target) dari /mavros/setpoint_raw/target_attitude --
  // dibandingkan dengan `imu` (aktual) buat panel "PID setpoint vs aktual".
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
  // Output motor/servo mentah (PWM), dari /mavros/rc/out.
  motorOut?: { channels: number[]; ts: number };
  // Status EKF PX4 dari /mavros/estimator_status -- flag boolean per aspek
  // estimasi (attitude/velocity/position/dst).
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
  // Tekanan barometer mentah (Pa) dari /mavros/imu/static_pressure.
  baro?: { pressureHpa: number; ts: number };
  // 2026-09-16 (atas permintaan user, debug bug "altitude WP+batch+takeoff
  // tidak mau turun ke target") -- 4 referensi altitude berbeda dari
  // /mavros/altitude sekaligus: amsl (absolut, referensi laut), local (Z
  // EKF, origin di-set PX4 saat fix GPS pertama), relative (REL_HOME,
  // referensi SAMA yang dipakai AUTO.MISSION push WP -- lihat
  // coordinate_frame_for() di mission_node.cpp), terrain (relatif tanah,
  // biasanya turunan rangefinder juga), bottomClearance (TF Mini, PALING
  // presisi di ketinggian rendah, bisa null kalau sensor di luar jangkauan
  // -- lihat armAndClimb() fix di flight_control.cpp yang sekarang pakai
  // field ini). null = NaN di sisi ROS (bukan 0 -- field belum tentu ada).
  altitude?: {
    amsl: number | null;
    local: number | null;
    relative: number | null;
    terrain: number | null;
    bottomClearance: number | null;
    ts: number;
  };
}

const MAX_LOG_LINES = 500;

// Command per service -- persis yang didokumentasikan di
// masterpiece_ws/launch.md. Vision pipeline launch file name diambil dari
// dokumentasi tsb (belum re-verifikasi ulang sejak ditulis).
function commandFor(name: ServiceName, missionOpts?: MissionStartOpts): string {
  switch (name) {
    case "mavros":
      // 2026-09-13 (background-process redesign): TIDAK lagi exec langsung
      // "ros2 launch" -- itu bikin MAVROS ikut mati begitu SSH connection
      // putus (proses = child dari exec channel ini). Sekarang panggil
      // victus.sh, yang men-daemonize (nohup+disown) MAVROS + mirror
      // MAVLink dual-GCS (lihat mavlink_gcs_mirror.py) sendiri ke DUA IP
      // yang sudah di-hardcode di script itu (10.42.0.75 & 10.42.0.44,
      // TIDAK configurable dari web -- lihat GCS_DEST_1/GCS_DEST_2 di
      // victus.sh), lalu exec ini SENDIRI selesai/exit begitu victus.sh
      // selesai membackground-kan semuanya -- fire-and-forget, TIDAK
      // ditahan channel-nya (lihat startService(), isBackgroundService()).
      // Status sebenarnya dicek lewat pgrep (lihat pollBackgroundStatus()),
      // bukan lagi dari exec channel ini masih hidup atau tidak.
      return "cd ~/mavros_ws && ./victus.sh";
    case "vision":
      // 2026-09-13: BELUM dipindah ke model background (kamera belum
      // terpasang fisik, ditunda atas permintaan user) -- start_vision.sh
      // SUDAH ada & teruji di raspi, tapi command ini masih tetap exec
      // langsung seperti sebelumnya sampai bagian vision digarap.
      return "cd ~/masterpiece_ws && source /opt/ros/jazzy/setup.bash && source install/setup.bash && exec ros2 launch vision_pipeline yolo_aruco.launch.xml";
    case "mission": {
      // pty:true (lihat startService()) -- WAJIB supaya gerbang keypress
      // "1" (RawKeyTerminal buka /dev/tty langsung, lihat mission_node.cpp)
      // beneran ada terminal untuk dibaca. Tanpa pty, /dev/tty gagal
      // dibuka, gerbang auto-skip (lihat catatan panjang di sana).
      // TIDAK diubah ke model background -- mission butuh channel live.
      //
      // 2026-09-16 (Retry Mission, atas permintaan user -- REVISI): versi
      // pertama pakai start_batch:=N/retry_takeoff:= (lihat
      // PANDUAN_MISSION_STEP_BY_STEP.md), TAPI user minta diganti --
      // "hapus start_batch:=N dan retry takeoff nya, main di duplikat wp
      // aja dan beda runner". Sekarang: mode Retry menjalankan
      // 03_mission.launch.xml SAMA PERSIS seperti Full Mission (tidak ada
      // argumen tambahan sama sekali, mekanisme takeoff/land/dst APA
      // ADANYA), CUMA config:=... diarahkan ke mission_retry.yaml (dibangun
      // ULANG tiap kali dari mission.yaml TERBARU oleh buildRetryMission()
      // sesaat sebelum ini dipanggil, lihat komentar di sana) -- file itu
      // isinya cuma WP1 (takeoff) + SATU batch target yang dipilih user,
      // label marker batch-nya DIPERTAHANKAN APA ADANYA (bukan dinomori
      // ulang -- lihat build_retry_mission.py, nomor di teks marker 100%
      // kosmetik buat parse_batches(), cuma dipertahankan verbatim supaya
      // override speed=/alt= di marker itu, kalau ada, tidak ikut hilang).
      // mission_node.cpp otomatis LAND begitu SEMUA batch di file yang
      // di-push selesai (lihat "Mission selesai, LAND..." di
      // mission_node.cpp) -- TIDAK butuh flag khusus.
      const configArg = missionOpts?.useRetryFile
        ? ` config:=${MISSION_RETRY_YAML_PATH.replace("~", "/home/vtol")}`
        : "";
      return `cd ~/masterpiece_ws && source /opt/ros/jazzy/setup.bash && source install/setup.bash && exec ros2 launch waypoint_mission 03_mission.launch.xml${configArg}`;
    }
    case "rtkRelay": {
      // 2026-09-13 (background-process redesign): dulu dijalankan LANGSUNG
      // (bukan lewat start.sh) supaya tetap menempel ke exec channel --
      // sekarang dibalik: panggil start.sh rtk:=true (yang sudah
      // men-daemonize sendiri lewat nohup+disown), fire-and-forget, TIDAK
      // ditahan channel-nya, supaya RTK relay bertahan walau SSH putus.
      // logs:=true WAJIB -- tanpa itu start.sh tidak menulis file log sama
      // sekali, jadi startLogTail()'s `tail -F` tidak akan pernah punya
      // apa pun untuk ditampilkan.
      //
      // 2026-09-16 (atas permintaan user): runner:=udp (default, perilaku
      // di atas TIDAK berubah) atau runner:=str2str (RTKLIB, TCP server) --
      // lihat start.sh di raspi utk detail & fix bug self-kill pgrep
      // (pattern "str2str" generik sempat match command line invokasi
      // start.sh ini sendiri).
      const runnerArg = missionOpts?.rtkRunner === "str2str" ? " runner:=str2str" : "";
      return `cd ~/rtk_gateway/raspi && ./start.sh rtk:=true${runnerArg} logs:=true`;
    }
    case "telemetry":
      // TIDAK diubah -- tetap exec-channel based, di-trigger sekarang oleh
      // transisi status mavros hasil polling pgrep (lihat
      // pollBackgroundStatus()), bukan lagi dari onExec callback exec
      // MAVROS (yang sudah tidak relevan sejak MAVROS jadi fire-and-forget).
      return "cd ~/telemetry_bridge && source /opt/ros/jazzy/setup.bash && source ~/mavros_ws/install/setup.bash && exec python3 -u telemetry_bridge.py";
    case "lcd":
      // sudo -S baca password dari stdin (bukan /dev/tty) -- "echo 0000 |"
      // langsung isi password itu, tidak perlu pty/kirim keypress terpisah.
      // "-f" follow terus sampai channel ini di-SIGINT (stopService).
      // TIDAK diubah -- journalctl -f pada dasarnya sudah cuma nge-tail
      // service systemd yang independen, exec channel di sini cuma viewer.
      return "echo 0000 | sudo -S journalctl -u wp_trigger_controller -f";
    case "mjpegStreamer":
      // 2026-09-13: web_video_server (paket resmi) gagal di-install -- raspi
      // tidak punya akses internet SAMA SEKALI (bukan cuma DNS), dan paket
      // itu sendiri berat (nyeret ffmpeg + puluhan lib audio/video lain).
      // Gantinya: script custom ringan, cuma rclpy+cv2+cv_bridge (SUDAH ada
      // di raspi, tidak perlu install apa pun) -- serve MJPEG di port 8090,
      // format sama persis yang diharapkan CameraPanel lewat SSH tunnel
      // yang sudah ada (startCameraTunnel(), tidak diubah). Auto-start/stop
      // mengikuti status "vision" (lihat cascade di onExec, sama pola
      // seperti telemetry<->mavros).
      //
      // 2026-09-16 (atas permintaan user, "kenapa gak yolo sama aruco aja
      // yang di-stream" -> "jadiin satu"): DUA --topic sekaligus --
      // /yolo/debug_image (bounding box YOLO, yolo_hef_node.cpp) +
      // /fiducial/debug_image (marker+pose axis ArUco, aruco.cpp), digabung
      // JADI SATU frame side-by-side oleh mjpeg_streamer.py sendiri (lihat
      // komentar panjang di sana) -- BUKAN raw camera feed lagi. Keduanya
      // SUDAH publish frame teranotasi (publish_debug_image default true di
      // node masing-masing), TIDAK ada perubahan di sisi C++ deteksi sama
      // sekali.
      return "cd ~/masterpiece_ws && source /opt/ros/jazzy/setup.bash && source install/setup.bash && exec python3 -u mjpeg_streamer.py --topic /yolo/debug_image --topic /fiducial/debug_image --port 8090";
    case "livox":
      // 2026-09-13: device SUDAH aktif mengirim point cloud terus-menerus
      // ke host_ip:point_data_port TANPA perlu command-handshake SDK sama
      // sekali (dikonfirmasi lewat capture UDP mentah langsung) -- jadi
      // TIDAK pakai livox_ros_driver2/Livox-SDK2/ROS2 sama sekali di sini,
      // cukup script Python murni (stdlib doang, tidak perlu source ROS2)
      // yang bind UDP raw ke port itu dan parse sendiri. "2D LATERAL"
      // (bukan 1D, bukan 3D) -- lihat komentar panjang di
      // livox_lateral_distance.py. TIDAK ada topic/domain ROS2 sama
      // sekali -- "cukup mendeteksi jarak aja", TIDAK menyentuh
      // waypoint_mission/mission_node.
      return "exec python3 -u ~/masterpiece_ws/livox_lateral_distance.py --host-ip 192.168.1.50 --port 56301";
    case "wpc":
      // "wpc" TIDAK PERNAH di-startService() -- log-only channel (lihat
      // komentar di deklarasi ServiceName), tidak ada command untuk
      // dijalankan. Case ini murni supaya switch tetap exhaustive di mata
      // TypeScript.
      throw new Error("commandFor('wpc') tidak seharusnya pernah dipanggil.");
    case "flightLogger":
      // Tombol "Record" di kartu MAVROS (2026-09-16, atas permintaan user)
      // -- ~/flight_logger_ws (workspace TERPISAH dari masterpiece_ws,
      // SUDAH di-build sebelumnya di raspi, lihat README.md-nya) merekam
      // SEMUA topic MAVROS/MAVLink yang aktif (ros2 bag record -a) ke
      // ~/flight_logs/rosbag2_<timestamp>/. TIDAK ditahan channel spesial
      // (pola sama seperti "lcd"/"vision") -- stop lewat SIGINT
      // (stopService()) supaya bag file-nya di-finalize dengan benar
      // (mcap), BUKAN pkill -9 yang bisa bikin file rusak/tidak lengkap.
      return "cd ~/flight_logger_ws && source /opt/ros/jazzy/setup.bash && source install/setup.bash && mkdir -p ~/flight_logs && exec ros2 launch flight_logger record_flight.launch.xml";
  }
}

// 2026-09-13: 3 service yang (rencananya) jadi proses background raspi,
// independen dari exec channel/SSH connection. Vision BELUM dipindah ke
// model ini (ditunda, lihat commandFor() case "vision") -- entry-nya
// sengaja TIDAK dimasukkan ke map ini dulu supaya pollBackgroundStatus()/
// stopBackgroundService() tidak keliru menganggap vision sudah background.
type BackgroundServiceName = "mavros" | "rtkRelay";
const BACKGROUND_SERVICES: readonly BackgroundServiceName[] = ["mavros", "rtkRelay"];

function isBackgroundService(name: ServiceName): name is BackgroundServiceName {
  return (BACKGROUND_SERVICES as readonly string[]).includes(name);
}

// Pola pgrep -f buat cek proses background masih hidup atau tidak, dan
// pola pkill buat stop-nya (leader dulu, biar cascade graceful ke child --
// lihat stopService()).
const LIVENESS_PATTERN: Record<BackgroundServiceName, string> = {
  mavros: "mavros_node",
  rtkRelay: "rtk_rover_relay.py",
};
const STOP_LEADER_PATTERN: Record<BackgroundServiceName, string> = {
  mavros: "ros2 launch mavros_bringup",
  rtkRelay: "rtk_rover_relay.py",
};

// rtkRelay (2026-09-16): pattern di atas cuma benar kalau runner:=udp
// (default). Kalau runner:=str2str yang terakhir dipakai (s.rtkRunner,
// diset startService()), pattern-nya BEDA -- pakai "str2str -in" (BUKAN
// cuma "str2str", lihat bug self-kill yang ditemukan di
// ~/rtk_gateway/*/start.sh: pattern generik "str2str" match command line
// invokasi start.sh sendiri kalau argumennya "runner:=str2str"). Fungsi
// ini dipakai gantinya akses langsung ke map statis di atas untuk
// "rtkRelay" spesifik, "mavros" tetap pakai map statis apa adanya.
function livenessPatternFor(s: GlobalSshState, name: BackgroundServiceName): string {
  if (name === "rtkRelay" && s.rtkRunner === "str2str") return "str2str -in";
  return LIVENESS_PATTERN[name];
}
function stopLeaderPatternFor(s: GlobalSshState, name: BackgroundServiceName): string {
  if (name === "rtkRelay" && s.rtkRunner === "str2str") return "str2str -in";
  return STOP_LEADER_PATTERN[name];
}

// pgrep -f/pkill -f mencocokkan SELURUH command line proses lain --
// termasuk shell wrapper yang menjalankan exec ini sendiri (sshd biasanya
// exec lewat `bash -c "<seluruh command kita>"`, dan command line bash -c
// itu SENDIRI mengandung teks pattern secara literal karena kita yang
// menulisnya di sana) -- tanpa trik ini, pgrep akan "menemukan" dirinya
// sendiri terus-menerus dan selalu melaporkan proses "hidup" walau tidak
// ada apa pun yang benar-benar jalan (dikonfirmasi via tes langsung di
// raspi, 2026-09-13). Bungkus huruf pertama pattern jadi character class
// (mis. "mavros_node" -> "[m]avros_node") -- masih regex yang SAMA
// PERSIS secara fungsional untuk mencocokkan proses lain, tapi literal
// string "[m]avros_node" TIDAK muncul sebagai substring di command line
// kita sendiri (yang menulis "mavros_node" polos, bukan "[m]avros_node"),
// jadi wrapper shell tidak lagi ke-match balik ke dirinya sendiri.
function selfSafePgrepPattern(pattern: string): string {
  return `[${pattern[0]}]${pattern.slice(1)}`;
}
// Log file stabil (symlink) yang ditulis start.sh/victus.sh masing-masing
// -- dipakai startLogTail() buat `tail -F`, lihat di bawah.
const LOG_FILE_PATH: Record<BackgroundServiceName, string> = {
  mavros: "~/mavros_ws/logs/mavros_current.log",
  rtkRelay: "~/rtk_gateway/raspi/logs/rtk_rover_relay_current.log",
};

const CAMERA_LOCAL_PORT = 8090;
const CAMERA_REMOTE_PORT = 8090;

interface GlobalSshState {
  conn: Client | null;
  connInfo: ConnectionInfo | null;
  connecting: boolean;
  services: Record<ServiceName, ServiceState>;
  streams: Partial<Record<ServiceName, ClientChannel>>;
  // Channel `tail -F` TERPISAH untuk service background (mavros/rtkRelay)
  // -- boleh putus-sambung bebas tanpa mematikan proses aslinya di raspi,
  // beda dari `streams` yang (untuk mission/lcd/vision/telemetry) MASIH
  // jadi proses itu sendiri. Lihat startLogTail().
  logTailStreams: Partial<Record<BackgroundServiceName, ClientChannel>>;
  logs: Record<ServiceName, string[]>;
  cameraServer: net.Server | null;
  cameraOpen: boolean;
  telemetry: TelemetryData;
  // Dipakai pollBackgroundStatus() buat deteksi transisi stopped->running/
  // running->stopped MAVROS (yang sekarang statusnya dari pgrep, bukan
  // exec channel) -- transisi itu yang men-trigger auto start/stop
  // telemetry (dulu dari onExec callback exec MAVROS langsung).
  prevMavrosRunning: boolean;
  // Cegah pollBackgroundStatus() jalan bertumpuk kalau dipanggil lagi
  // sebelum round sebelumnya selesai (mis. polling cepat + SSH lambat).
  pollingBackground: boolean;
  // Runner rtkRelay yang TERAKHIR dipakai untuk start (2026-09-16) --
  // dibaca livenessPatternFor()/stopLeaderPatternFor() supaya
  // pgrep/pkill pakai pattern yang benar (rtk_rover_relay.py vs
  // "str2str -in"). Diset startService(), TIDAK direset otomatis saat
  // stop (biar konsisten dipakai stopService() yang dipanggil setelahnya).
  rtkRunner: "udp" | "str2str";
  // Tombol "Build" di panel Mission (colcon build --packages-select
  // waypoint_mission) -- BUKAN service jangka panjang seperti yang lain
  // (tidak ada pgrep/liveness check, cuma one-shot command yang selesai
  // sendiri), jadi statusnya dipisah dari `services`. Output-nya di-append
  // ke logs.mission yang SUDAH ADA (prefix "[build]"), tidak bikin tab log
  // baru.
  missionBuild: "idle" | "building" | "success" | "error";
  // Tombol "Ambil WP"/"Tambah WP" per-baris di panel WAYPOINT COORDINATE --
  // status capture GPS live per nomor WP (1-based), dipakai animasi
  // sukses/gagal di web (konsep sama seperti AMBIL WP fisik di LCD, lihat
  // captureWaypoint()). Key = nomor WP.
  waypointCapture: Record<number, { status: "capturing" | "success" | "error"; message: string; ts: number }>;
  // Cegah 2 capture berjalan bersamaan (position_reporter_node pakai flock
  // internal jadi tidak akan korup, tapi 2 proses ros2 launch nabrak itu
  // buang-buang resource & bikin UX membingungkan) -- guard sederhana di
  // level server.
  waypointCaptureBusy: boolean;
}

// Next.js dev server hot-reloads modules -- stash state on `globalThis` so a
// reconnect isn't required every time a route file is edited.
const g = globalThis as unknown as { __sshState?: GlobalSshState };

function freshServiceState(): ServiceState {
  return { status: "stopped", startedAt: null, lastError: null };
}

function state(): GlobalSshState {
  if (!g.__sshState) {
    g.__sshState = {
      conn: null,
      connInfo: null,
      connecting: false,
      services: {
        mavros: freshServiceState(),
        vision: freshServiceState(),
        mission: freshServiceState(),
        rtkRelay: freshServiceState(),
        telemetry: freshServiceState(),
        lcd: freshServiceState(),
        mjpegStreamer: freshServiceState(),
        livox: freshServiceState(),
        wpc: freshServiceState(),
        flightLogger: freshServiceState(),
      },
      streams: {},
      logTailStreams: {},
      logs: {
        mavros: [], vision: [], mission: [], rtkRelay: [], telemetry: [], lcd: [],
        mjpegStreamer: [], livox: [], wpc: [], flightLogger: [],
      },
      cameraServer: null,
      cameraOpen: false,
      telemetry: {},
      prevMavrosRunning: false,
      pollingBackground: false,
      rtkRunner: "udp",
      missionBuild: "idle",
      waypointCapture: {},
      waypointCaptureBusy: false,
    };
  }
  return g.__sshState;
}

function appendLog(name: ServiceName, line: string) {
  const s = state();
  const buf = s.logs[name];
  for (const part of line.split("\n")) {
    const trimmed = part.replace(/\r$/, "");
    if (trimmed.length === 0) continue;
    buf.push(trimmed);
  }
  while (buf.length > MAX_LOG_LINES) buf.shift();
}

export function isConnected(): boolean {
  return state().conn !== null && !state().connecting;
}

export function getConnectionInfo(): ConnectionInfo | null {
  return state().connInfo;
}

const EXEC_CAPTURE_TIMEOUT_MS = 8000;

// Jalankan satu command lewat exec channel SEKALI PAKAI, tunggu sampai
// selesai, kembalikan stdout gabungan + exit code -- dipakai buat cek
// pgrep/kirim pkill, BUKAN buat service jangka panjang (itu pakai
// s.streams/s.logTailStreams seperti biasa).
//
// 2026-09-13 bugfix: pernah macet permanen (channel SSH exhausted --
// sshd MaxSessions kena limit setelah banyak exec dibuka sepanjang sesi
// lama, conn.exec()'s callback tidak pernah dipanggil sama sekali, promise
// ini gantung selamanya) -- itu bikin pollBackgroundStatus()'s guard
// `pollingBackground` macet `true` untuk SELAMANYA, status service jadi
// beku di nilai terakhir yang benar (mis. "running" walau proses aslinya
// sudah mati). WAJIB ada timeout supaya promise ini selalu settle.
function execCapture(conn: Client, command: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`execCapture timeout (${EXEC_CAPTURE_TIMEOUT_MS}ms): ${command}`));
    }, EXEC_CAPTURE_TIMEOUT_MS);
    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timeout);
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      stream.on("data", (data: Buffer) => {
        stdout += data.toString("utf8");
      });
      // 2026-09-14: stderr SEKARANG ditangkap juga (dulu dibuang) -- start.sh
      // buat rtkRelay bisa exit non-zero dengan pesan error jelas ke stderr
      // (mis. "device F9P Rover tidak terdeteksi"), dan itu WAJIB kelihatan
      // di log/status web UI, bukan cuma pgrep/pkill yang butuh exit code
      // doang seperti pemakaian execCapture() lainnya.
      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString("utf8");
      });
      stream.on("close", (code: number | null) => {
        clearTimeout(timeout);
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  });
}

// Buka exec channel independen yang `tail -n 200 -F <logfile>` -- alirkan
// ke appendLog() yang sudah ada, PERSIS seperti stream service biasa,
// tapi channel ini TIDAK terikat ke lifecycle proses aslinya di raspi:
// boleh putus (SSH blip, dsb) dan dibuka ulang tanpa mematikan apa pun di
// raspi, karena bukan proses itu sendiri, cuma "penonton" file log-nya.
function startLogTail(name: BackgroundServiceName) {
  const s = state();
  if (!s.conn || s.logTailStreams[name]) return;
  const conn = s.conn;
  const path = LOG_FILE_PATH[name];
  conn.exec(`tail -n 200 -F ${path} 2>/dev/null`, (err, stream) => {
    if (err) return;
    s.logTailStreams[name] = stream;
    stream.on("data", (data: Buffer) => appendLog(name, data.toString("utf8")));
    stream.on("close", () => {
      delete s.logTailStreams[name];
      // Kalau service ini masih dianggap hidup (pgrep), tail-nya bakal
      // dibuka ulang otomatis di round pollBackgroundStatus() berikutnya
      // (lihat di sana) -- tidak perlu retry manual di sini.
    });
  });
}

function stopLogTail(name: BackgroundServiceName) {
  const s = state();
  s.logTailStreams[name]?.close();
  delete s.logTailStreams[name];
}

// Polling status utama untuk service background (mavros/rtkRelay): satu
// round-trip pgrep gabungan (dipisah "---"), bukan trust `streams[name]`
// lagi (yang sudah tidak relevan sejak service ini fire-and-forget, lihat
// commandFor()). Dipanggil dari getStatus() tiap kali di-poll frontend
// (~2 detik sekali, lihat useGroundControl.tsx) -- jadi tidak perlu
// interval terpisah.
async function pollBackgroundStatus(): Promise<void> {
  const s = state();
  if (!s.conn || s.pollingBackground) return;
  s.pollingBackground = true;
  try {
    const conn = s.conn;
    const patterns = BACKGROUND_SERVICES.map((name) => livenessPatternFor(s, name));
    const combinedCmd = patterns
      .map((p) => `pgrep -f "${selfSafePgrepPattern(p)}" > /dev/null && echo 1 || echo 0`)
      .join(" ; ");
    const { stdout } = await execCapture(conn, combinedCmd);
    const results = stdout.trim().split("\n").map((line) => line.trim() === "1");

    for (let i = 0; i < BACKGROUND_SERVICES.length; i++) {
      const name = BACKGROUND_SERVICES[i];
      const alive = results[i] === true;
      const prevStatus = s.services[name].status;
      if (alive) {
        if (prevStatus !== "running") {
          s.services[name] = { status: "running", startedAt: Date.now(), lastError: null };
          appendLog(name, "[system] Proses terdeteksi hidup di raspi (pgrep).");
        }
        startLogTail(name);
      } else {
        if (prevStatus === "running" || prevStatus === "stopping") {
          s.services[name] = { status: "stopped", startedAt: null, lastError: null };
          appendLog(name, "[system] Proses tidak lagi terdeteksi di raspi (pgrep).");
        } else if (prevStatus !== "starting") {
          s.services[name] = { status: "stopped", startedAt: null, lastError: null };
        }
        stopLogTail(name);
      }
    }

    // Telemetry auto-start/stop di-anchor ke transisi status MAVROS hasil
    // pgrep (dulu dari onExec callback exec MAVROS langsung, yang sudah
    // tidak relevan sejak MAVROS jadi fire-and-forget lewat victus.sh).
    const mavrosRunningNow = s.services.mavros.status === "running";
    if (mavrosRunningNow && !s.prevMavrosRunning && s.services.telemetry.status === "stopped") {
      startService("telemetry");
    } else if (!mavrosRunningNow && s.prevMavrosRunning && s.services.telemetry.status === "running") {
      stopService("telemetry");
    }
    s.prevMavrosRunning = mavrosRunningNow;
  } catch {
    // SSH blip saat polling -- biarkan status apa adanya, round berikutnya
    // coba lagi (tidak reset paksa ke stopped supaya tidak "flicker" kalau
    // cuma hiccup jaringan sesaat).
  } finally {
    s.pollingBackground = false;
  }
}

export async function getStatus() {
  const s = state();
  if (s.conn) {
    await pollBackgroundStatus();
  }
  return {
    connected: isConnected(),
    connecting: s.connecting,
    connectionInfo: s.connInfo,
    cameraOpen: s.cameraOpen,
    services: s.services,
    missionBuild: s.missionBuild,
    waypointCapture: s.waypointCapture,
  };
}

export function getLogs(name: ServiceName): string[] {
  return [...state().logs[name]];
}

// masterpiece_ws (raspi) adalah source of truth (lihat memory
// feedback_masterpiecews_raspi_source_of_truth) -- file ini dibaca
// LANGSUNG dari raspi tiap kali panel Mission minta refresh, TIDAK ada
// copy lokal yang di-cache di server Next.js ini.
const MISSION_YAML_PATH = "~/masterpiece_ws/src/waypoint_mission/config/mission.yaml";
// Retry Mission (2026-09-16) -- dibangun ULANG tiap kali dari
// MISSION_YAML_PATH oleh buildRetryMission(), TIDAK PERNAH di-maintain
// sebagai duplikat yang terus-menerus sinkron (lihat komentar panjang di
// buildRetryMission()).
const MISSION_RETRY_YAML_PATH = "~/masterpiece_ws/src/waypoint_mission/config/mission_retry.yaml";

export async function getMissionYaml(
  path: string = MISSION_YAML_PATH,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "SSH belum terhubung." };
  }
  try {
    const { code, stdout } = await execCapture(s.conn, `cat ${path}`);
    if (code !== 0) {
      return { ok: false, error: `Gagal membaca file (exit ${code}): ${path}` };
    }
    return { ok: true, text: stdout };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Tombol "Restart LCD" di tab log LCD -- restart systemd service
// wp_trigger_controller (OLED 1.3" + 5 tombol) di raspi. BEDA dari
// startService/stopService("lcd") yang cuma nge-tail
// `journalctl -u wp_trigger_controller -f` (viewer, bukan proses aslinya)
// -- ini yang benar-benar me-restart proses OLED-nya sendiri. One-shot,
// cepat (systemctl restart biasa selesai <1detik), jadi execCapture()
// (timeout 8 detik) sudah cukup, tidak perlu exec channel terpisah kayak
// buildMission().
export async function restartLcdDisplay(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  appendLog("lcd", "[system] Merestart wp_trigger_controller.service...");
  try {
    const { code, stderr } = await execCapture(
      s.conn,
      "echo 0000 | sudo -S systemctl restart wp_trigger_controller",
    );
    if (code !== 0) {
      const msg = stderr.trim() || `systemctl restart keluar dengan kode ${code}`;
      appendLog("lcd", `[system] Gagal restart: ${msg}`);
      return { ok: false, error: msg };
    }
    appendLog("lcd", "[system] wp_trigger_controller.service berhasil di-restart.");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog("lcd", `[system] Gagal restart: ${msg}`);
    return { ok: false, error: msg };
  }
}

// Tombol "Build" di panel Mission -- one-shot `colcon build`, BUKAN
// dijalankan lewat execCapture() (timeout 8 detik-nya kejauhan pendek buat
// build, yang bisa makan puluhan detik s/d menit) -- exec channel biasa
// yang dibiarkan hidup sampai proses build-nya sendiri selesai/exit,
// output-nya di-stream live ke logs.mission (prefix "[build]") supaya bisa
// dipantau dari tab log MISSION yang sudah ada, tanpa tab baru.
export function buildMission(): { ok: true } | { ok: false; error: string } {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  if (s.missionBuild === "building") {
    return { ok: false, error: "Build sudah sedang berjalan." };
  }
  s.missionBuild = "building";
  appendLog("mission", "[build] Menjalankan: colcon build --packages-select waypoint_mission");
  const command =
    "cd ~/masterpiece_ws && source /opt/ros/jazzy/setup.bash && " +
    "colcon build --packages-select waypoint_mission 2>&1";
  s.conn.exec(command, (err, stream) => {
    if (err) {
      s.missionBuild = "error";
      appendLog("mission", `[build] Gagal menjalankan build: ${err.message}`);
      return;
    }
    stream.on("data", (data: Buffer) => {
      for (const line of data.toString("utf8").split("\n")) {
        if (line.trim().length === 0) continue;
        appendLog("mission", `[build] ${line}`);
      }
    });
    stream.on("close", (code: number | null) => {
      s.missionBuild = code === 0 ? "success" : "error";
      appendLog(
        "mission",
        code === 0
          ? "[build] Build selesai (sukses)."
          : `[build] Build gagal (exit code ${code ?? "?"}).`,
      );
    });
  });
  return { ok: true };
}

// Tombol "Ambil WP"/"Tambah WP" di panel WAYPOINT COORDINATE -- SENGAJA
// meniru PERSIS pola ui_ws (wp_trigger_controller, LCD fisik) supaya
// perilakunya identik dengan tombol AMBIL WP di panel LCD, bukan bikin
// mekanisme baru: lihat real_wp_capture.cpp (buildCommand()) di
// ~/ui_ws/src/wp_trigger_controller/src/ -- command, urutan argumen, dan
// timeout (15 detik, kTimeoutMs) di bawah ini SAMA PERSIS dengan itu.
// - `batch:=0` -- "tidak menyentuh penanda BATCH sama sekali" (aman, tidak
//   mengubah struktur batch WP lain).
// - `land:=false` -- TERVERIFIKASI (baca source position_reporter_node.cpp)
//   ini NO-OP aman, tidak pernah "menghidupkan lagi" WP lain yang sudah
//   di-nonaktifkan sebelumnya (truncate_active cuma jadi true kalau
//   land:=true ATAU batch turun -- kita kirim batch:=0 yang juga aman).
// - `takeoff:=true` HANYA untuk WP1 (konvensi sama seperti ui_ws).
// Sukses/gagal ditentukan SAMA PERSIS seperti RealWpCapture::poll(): exit
// code proses == 0 (BUKAN grep teks log tertentu -- log bisa berubah-ubah
// kapan saja), lalu mission.yaml di-re-parse buat pastikan baris WP itu
// masih valid (sanity check, meniru parseResult()).
const WP_CAPTURE_TIMEOUT_MS = 15000;

interface WaypointCaptureParams {
  index: number; // 1-based
  holdS: string;
  speedMps: string; // "--" -> dikirim sebagai "nan" (tidak override)
  altM: string;
  gripperOpen: boolean;
  // batch:=0 (default) -- "tidak menyentuh penanda BATCH sama sekali" (aman).
  // Diisi angka >=1 kalau operator EKSPLISIT mengubah batch WP ini lewat
  // modal Detail (lihat waypoint-detail-modal.tsx) -- SAMA PERSIS field
  // `batch` di Waypoint struct ui_ws (waypoint.hpp).
  batch?: string;
  // land:=false (default) -- TERVERIFIKASI no-op aman (lihat komentar di
  // captureWaypoint()). true HANYA dikirim kalau operator SENGAJA menandai
  // WP ini sebagai titik akhir misi lewat modal Detail -- efeknya WP
  // SETELAHNYA otomatis di-comment (truncate_active) oleh
  // position_reporter_node.cpp, PERSIS seperti physical LCD.
  land?: boolean;
  // true = edit metadata WP yang SUDAH ADA tanpa mengambil GPS baru sama
  // sekali (lat/lon lama dipertahankan) -- dipakai tombol "Save" di modal
  // Detail. Lihat position_reporter_node.cpp::recordMetadataOnly().
  metadataOnly?: boolean;
  // 2026-09-16 (fitur "Ambil WP1 Retry"): target mission_file:=... BEDA
  // dari MISSION_YAML_PATH default -- dipakai captureRetryWp1() untuk
  // nulis ke MISSION_RETRY_YAML_PATH, TIDAK PERNAH menyentuh mission.yaml
  // asli sama sekali.
  targetMissionFile?: string;
  // Key ke s.waypointCapture[...] BEDA dari `index` (yang tetap berarti
  // "wp:=... di launch command" apa adanya) -- WAJIB dipakai kalau
  // targetMissionFile diisi, supaya status Ambil WP1 Retry TIDAK menimpa/
  // ketimpa status Ambil WP1 biasa (index 1) yang independen.
  stateKey?: number;
}

function buildWpLaunchCommand(p: WaypointCaptureParams): string {
  const speedArg = p.speedMps === "--" || p.speedMps.trim().length === 0 ? "nan" : p.speedMps;
  const takeoff = p.index === 1 ? "true" : "false";
  const missionFile = (p.targetMissionFile ?? MISSION_YAML_PATH).replace("~", "/home/vtol");
  return (
    "source /opt/ros/jazzy/setup.bash && " +
    "source /home/vtol/masterpiece_ws/install/setup.bash && " +
    "exec ros2 launch waypoint_mission wp.launch.xml" +
    ` wp:=${p.index}` +
    ` mission_file:=${missionFile}` +
    ` hold:=${p.holdS}` +
    ` speed:=${speedArg}` +
    ` alt:=${p.altM}` +
    ` batch:=${p.batch ?? "0"}` +
    ` gripper:=${p.gripperOpen ? "open" : "none"}` +
    ` land:=${p.land ? "true" : "false"}` +
    ` takeoff:=${takeoff}` +
    (p.metadataOnly ? " metadata_only:=true" : "")
  );
}

export function captureWaypoint(
  params: WaypointCaptureParams,
): { ok: true } | { ok: false; error: string } {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  if (s.waypointCaptureBusy) {
    return { ok: false, error: "Ada proses ambil WP lain yang masih berjalan." };
  }
  const { index } = params;
  const stateKey = params.stateKey ?? index;
  s.waypointCaptureBusy = true;
  s.waypointCapture[stateKey] = { status: "capturing", message: "Mengambil posisi GPS...", ts: Date.now() };
  const command = buildWpLaunchCommand(params);
  appendLog("wpc", `[ambilwp] WP${index}: ${command}`);

  const conn = s.conn;
  let settled = false;
  const finish = (ok: boolean, message: string) => {
    if (settled) return;
    settled = true;
    s.waypointCaptureBusy = false;
    s.waypointCapture[stateKey] = { status: ok ? "success" : "error", message, ts: Date.now() };
    appendLog("wpc", `[ambilwp] WP${index}: ${message}`);
  };

  conn.exec(command, (err, stream) => {
    if (err) {
      finish(false, `Gagal menjalankan: ${err.message}`);
      return;
    }
    const killTimer = setTimeout(() => {
      // SAMA seperti RealWpCapture::killAsync() -- SIGTERM dulu, tunggu
      // sebentar, SIGKILL kalau masih hidup (via pkill terpisah, BUKAN
      // stream.signal() -- riwayat proyek ini menunjukkan signal lewat SSH
      // channel tidak selalu diteruskan dengan andal ke child process
      // ros2 launch, lihat catatan lama soal vision_pipeline TIDAK
      // merespon SIGINT sama sekali).
      execCapture(conn, `pkill -TERM -f "wp.launch.xml wp:=${index} mission_file:="`).catch(() => {});
      setTimeout(() => {
        if (!settled) {
          execCapture(conn, `pkill -9 -f "wp.launch.xml wp:=${index} mission_file:="`).catch(() => {});
        }
      }, 500);
      finish(false, "Timeout menunggu GPS sample yang valid (15s) -- sinyal GPS kemungkinan kurang baik.");
    }, WP_CAPTURE_TIMEOUT_MS);

    stream.on("data", (data: Buffer) => {
      for (const line of data.toString("utf8").split("\n")) {
        if (line.trim().length === 0) continue;
        appendLog("wpc", `[ambilwp] ${line}`);
      }
    });
    stream.on("close", async (code: number | null) => {
      clearTimeout(killTimer);
      if (settled) return;
      if (code !== 0) {
        finish(false, `Proses keluar dengan kode ${code ?? "?"} (gagal/dibatalkan).`);
        return;
      }
      // Sanity check ala parseResult() -- pastikan baris WP itu masih ada
      // & valid setelah proses selesai.
      try {
        const yamlResult = await getMissionYaml(params.targetMissionFile);
        if (!yamlResult.ok) {
          finish(false, `Selesai, tapi gagal verifikasi ulang mission.yaml: ${yamlResult.error}`);
          return;
        }
        const parsed = parseMissionYaml(yamlResult.text);
        const wp = parsed.waypoints[index - 1];
        if (!wp) {
          finish(false, "Selesai, tapi WP tidak ditemukan lagi di mission.yaml setelah verifikasi.");
          return;
        }
        finish(true, `Berhasil: lat=${wp.lat} lon=${wp.lon} alt=${wp.alt}`);
      } catch (verifyErr) {
        finish(
          false,
          `Selesai, tapi verifikasi gagal: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
        );
      }
    });
  });
  return { ok: true };
}

// Tombol "Ambil WP1 Retry" (2026-09-16, atas permintaan user, web + LCD
// fisik/ui_ws) -- ambil ulang posisi GPS drone SEKARANG sebagai titik
// takeoff Retry Mission, dipakai kalau drone mendarat di lokasi BEDA dari
// WP1 asli setelah mission sempat berhenti di tengah. Params (hold/speed/
// alt/gripper) HARUS disuplai caller dari WP1 ASLI di mission.yaml (lihat
// mission-panel.tsx, "paramnya samain kaya wp1 batch 1 yang biasanya") --
// fungsi ini SENGAJA tidak baca sendiri, biar konsisten dengan pola
// captureWaypoint() yang lain (caller yang tahu data terbaru).
// wp:=1 + mission_file:=MISSION_RETRY_YAML_PATH + stateKey:=0 (sentinel,
// WP asli selalu >=1) supaya status capture ini TIDAK bentrok dengan
// status "Ambil WP" WP1 biasa yang independen.
export function captureRetryWp1(params: {
  holdS: string;
  speedMps: string;
  altM: string;
  gripperOpen: boolean;
}): { ok: true } | { ok: false; error: string } {
  return captureWaypoint({
    index: 1,
    holdS: params.holdS,
    speedMps: params.speedMps,
    altM: params.altM,
    gripperOpen: params.gripperOpen,
    targetMissionFile: MISSION_RETRY_YAML_PATH,
    stateKey: 0,
  });
}

// Tombol "Delete WP" di modal Detail -- TIDAK ada node/launch file resmi
// buat hapus 1 WP saja di masterpiece_ws (cuma ada reset_all = hapus
// SEMUA), jadi pakai script kecil terpisah (delete_waypoint.py, text-line
// mutation dengan flock, TIDAK menyentuh baris/parameter lain) -- lihat
// ~/masterpiece_ws/delete_waypoint.py.
export async function deleteWaypoint(index: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  appendLog("wpc", `[deletewp] Menghapus WP${index}...`);
  try {
    const { code, stdout, stderr } = await execCapture(
      s.conn,
      `python3 ~/masterpiece_ws/delete_waypoint.py --mission-file ${MISSION_YAML_PATH.replace("~", "/home/vtol")} --wp ${index}`,
    );
    if (code !== 0) {
      const msg = stderr.trim() || stdout.trim() || `keluar dengan kode ${code}`;
      appendLog("wpc", `[deletewp] Gagal: ${msg}`);
      return { ok: false, error: msg };
    }
    appendLog("wpc", `[deletewp] ${stdout.trim()}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog("wpc", `[deletewp] Gagal: ${msg}`);
    return { ok: false, error: msg };
  }
}

// Tombol "Tambah WP" -- atas permintaan user, INI TIDAK mengambil GPS sama
// sekali (beda dari captureWaypoint()/"Ambil WP" yang benar-benar
// menjalankan wp.launch.xml dan menunggu posisi live). Cukup sisipkan SATU
// baris placeholder baru (lat/lon di-copy dari WP terakhir yang ada, field
// lain minimal/tanpa override) di akhir daftar, meniru pola
// deleteWaypoint()/delete_waypoint.py -- text-line mutation dengan flock,
// TIDAK menyentuh baris/parameter lain. Operator bisa isi GPS beneran nanti
// lewat "Ambil WP" atau edit field lain lewat modal Detail (Save).
export async function addWaypoint(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  appendLog("wpc", "[addwp] Menambah WP baru...");
  try {
    const { code, stdout, stderr } = await execCapture(
      s.conn,
      `python3 ~/masterpiece_ws/add_waypoint.py --mission-file ${MISSION_YAML_PATH.replace("~", "/home/vtol")}`,
    );
    if (code !== 0) {
      const msg = stderr.trim() || stdout.trim() || `keluar dengan kode ${code}`;
      appendLog("wpc", `[addwp] Gagal: ${msg}`);
      return { ok: false, error: msg };
    }
    appendLog("wpc", `[addwp] ${stdout.trim()}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog("wpc", `[addwp] Gagal: ${msg}`);
    return { ok: false, error: msg };
  }
}

// Tombol "Reset" di panel WAYPOINT COORDINATE (2026-09-16, atas permintaan
// user: "fungsi yang sama kaya yang ada pada ui_ws") -- position_reporter_
// node.cpp SUDAH punya mode reset_all_ (kosongkan SELURUH waypoints: di
// mission.yaml, param lain dipertahankan, auto-backup ke config/backup/),
// TAPI belum di-wire ke wp.launch.xml sama sekali (bug yang sama seperti
// metadata_only sebelumnya) -- sudah ditambahkan di sana (2026-09-16).
// wp:=0 WAJIB dikirim bareng reset_all:=true (position_reporter_node.cpp
// menolak reset_all_+wp_index_>0 sebagai kombinasi eksklusif, dan
// wp.launch.xml sendiri default wp:=1 kalau tidak di-override).
export async function resetAllWaypoints(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  appendLog("wpc", "[reset] Menghapus SELURUH waypoint...");
  try {
    const command =
      "source /opt/ros/jazzy/setup.bash && source ~/masterpiece_ws/install/setup.bash && " +
      `ros2 launch waypoint_mission wp.launch.xml wp:=0 mission_file:=${MISSION_YAML_PATH.replace("~", "/home/vtol")} reset_all:=true`;
    const { code, stdout, stderr } = await execCapture(s.conn, command);
    if (code !== 0) {
      const msg = stderr.trim() || stdout.trim() || `keluar dengan kode ${code}`;
      appendLog("wpc", `[reset] Gagal: ${msg}`);
      return { ok: false, error: msg };
    }
    appendLog("wpc", "[reset] Seluruh waypoint dihapus (backup otomatis dibuat di raspi).");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog("wpc", `[reset] Gagal: ${msg}`);
    return { ok: false, error: msg };
  }
}

// Retry Mission (2026-09-16, REVISI atas permintaan user) -- bangun ULANG
// mission_retry.yaml dari mission.yaml TERBARU setiap kali dipanggil
// (SELALU dipanggil tepat sebelum startService("mission",
// {useRetryFile:true}), lihat mission-panel.tsx) -- file itu isinya WP1
// (takeoff, batch 1 apa adanya) + SATU batch target yang dipilih user,
// marker batch-nya dipertahankan APA ADANYA (bukan dinomori ulang -- lihat
// build_retry_mission.py, nomor batch di teks marker cuma kosmetik buat
// mission_node.cpp, dipertahankan verbatim supaya override speed=/alt= di
// situ, kalau ada, tidak ikut hilang), param lain (flight_speed_mps, dst)
// disalin apa adanya dari mission.yaml. TIDAK ADA duplikat yang
// di-maintain terus-menerus -- karena SELALU dibangun ulang dari sumber
// yang sama tepat sebelum dipakai, TIDAK ADA risiko basi/tidak sinkron
// kalau WP di batch itu diedit ulang lewat Ambil WP kapan pun sebelumnya.
export async function buildRetryMission(
  batch: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  appendLog("wpc", `[retry] Membangun mission_retry.yaml dari BATCH ${batch}...`);
  try {
    const missionPath = MISSION_YAML_PATH.replace("~", "/home/vtol");
    const retryPath = MISSION_RETRY_YAML_PATH.replace("~", "/home/vtol");
    const { code, stdout, stderr } = await execCapture(
      s.conn,
      `python3 ~/masterpiece_ws/build_retry_mission.py --mission-file ${missionPath} --batch ${batch} --out ${retryPath}`,
    );
    if (code !== 0) {
      const msg = stderr.trim() || stdout.trim() || `keluar dengan kode ${code}`;
      appendLog("wpc", `[retry] Gagal: ${msg}`);
      return { ok: false, error: msg };
    }
    appendLog("wpc", `[retry] ${stdout.trim()}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog("wpc", `[retry] Gagal: ${msg}`);
    return { ok: false, error: msg };
  }
}

// Tombol "Open"/"Close" di kartu LCD & GRIPPER (2026-09-16, atas permintaan
// user) -- publish satu kali ke /gripper_cmd (std_msgs/String, "open"/
// "close"), dikonsumsi servo_driver_node.cpp. AMAN dipakai walau mission
// SEDANG jalan (03_mission.launch.xml men-include gripper.launch.xml
// sendiri) -- pgrep dulu, cuma start instance standalone kalau BELUM ada
// servo_driver hidup sama sekali, supaya TIDAK PERNAH ada 2 instance
// rebutan GPIO (lihat warning eksplisit di PANDUAN_MISSION_STEP_BY_STEP.md,
// bagian GRIPPER).
export async function sendGripperCommand(
  cmd: "open" | "close",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  const conn = s.conn;
  appendLog("lcd", `[gripper] Mengirim perintah ${cmd}...`);
  try {
    const alive = await execCapture(conn, `pgrep -f "${selfSafePgrepPattern("servo_driver")}"`);
    if (alive.code !== 0) {
      appendLog(
        "lcd",
        "[gripper] servo_driver belum hidup -- menjalankan gripper.launch.xml standalone...",
      );
      // Lewat script file (start_gripper_manual.sh), BUKAN inline
      // "nohup ... & disown" langsung sebagai command string -- ditemukan
      // 2026-09-16: versi inline bikin exec channel-nya tidak pernah
      // "close" (execCapture timeout 8s) walau command yang SAMA PERSIS
      // kalau dijalankan manual di terminal SSH return instan. Pola
      // script-file ini konsisten dengan victus.sh/start.sh yang SUDAH
      // terbukti stabil.
      await execCapture(conn, "cd ~/masterpiece_ws && ./start_gripper_manual.sh");
      // Beri waktu node baru selesai init + DDS discovery -- publish
      // langsung setelah start seringkali "hilang" karena subscriber-nya
      // belum sempat ke-discover oleh publisher `ros2 topic pub`.
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    const pubCmd =
      "source /opt/ros/jazzy/setup.bash && source ~/masterpiece_ws/install/setup.bash && " +
      `ros2 topic pub --once /gripper_cmd std_msgs/msg/String "data: '${cmd}'"`;
    const { code, stdout, stderr } = await execCapture(conn, pubCmd);
    if (code !== 0) {
      const msg = stderr.trim() || stdout.trim() || `keluar dengan kode ${code}`;
      appendLog("lcd", `[gripper] Gagal: ${msg}`);
      return { ok: false, error: msg };
    }
    appendLog("lcd", `[gripper] Perintah ${cmd} terkirim.`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog("lcd", `[gripper] Gagal: ${msg}`);
    return { ok: false, error: msg };
  }
}

// Indikator sinyal WiFi di header (2026-09-16, atas permintaan user) --
// raspi ini punya 2 adaptor WiFi (lihat riwayat proyek: wlan0 = WiFi
// bawaan RPi5, wlxd4d6df574517 = adaptor USB TP-Link tambahan, dipasang
// justru supaya ada JALUR CADANGAN kalau salah satu tidak kedetect/gagal
// konek) -- keduanya di-query sekali jalan lewat `iw dev <iface> link`.
const WIFI_INTERFACES = ["wlan0", "wlxd4d6df574517"] as const;

export interface WifiInterfaceSignal {
  iface: string;
  connected: boolean;
  ssid: string | null;
  signalDbm: number | null;
}

export async function getWifiSignal(): Promise<
  { ok: true; interfaces: WifiInterfaceSignal[] } | { ok: false; error: string }
> {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  try {
    const results: WifiInterfaceSignal[] = [];
    for (const iface of WIFI_INTERFACES) {
      const { stdout } = await execCapture(s.conn, `iw dev ${iface} link 2>&1`);
      const connected = !/not connected/i.test(stdout);
      const ssidMatch = stdout.match(/SSID:\s*(.+)/);
      const signalMatch = stdout.match(/signal:\s*(-?\d+)\s*dBm/);
      results.push({
        iface,
        connected,
        ssid: connected && ssidMatch ? ssidMatch[1].trim() : null,
        signalDbm: signalMatch ? Number(signalMatch[1]) : null,
      });
    }
    return { ok: true, interfaces: results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function connect(opts: {
  host: string;
  port: number;
  username: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = state();
  if (s.conn) {
    return { ok: false, error: "Sudah terhubung -- disconnect dulu sebelum connect ulang." };
  }
  // Reset guard polling -- kalau sempat macet true selamanya dari koneksi
  // SEBELUMNYA (lihat catatan panjang di execCapture()), koneksi baru ini
  // harus mulai bersih, bukan ikut terkunci status lama.
  s.pollingBackground = false;
  s.connecting = true;
  return new Promise((resolve) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
    }, 10000);
    conn.on("ready", () => {
      clearTimeout(timeout);
      s.conn = conn;
      s.connInfo = { host: opts.host, port: opts.port, username: opts.username };
      s.connecting = false;
      conn.on("close", () => {
        // Koneksi putus (network/raspi mati) -- service exec-channel-based
        // (mission/lcd/vision/telemetry) otomatis dianggap berhenti
        // (channel-nya ikut hilang bareng koneksi). TAPI mavros/rtkRelay
        // TIDAK ikut direset (2026-09-13, background-process redesign) --
        // proses aslinya di raspi jalan fire-and-forget lewat
        // victus.sh/start.sh, TIDAK terikat exec channel/koneksi SSH ini
        // sama sekali, jadi statusnya harus tetap apa adanya sampai
        // reconnect + pollBackgroundStatus() berikutnya mengecek pgrep
        // yang sebenarnya. Cuma logTailStreams (viewer log, bukan proses
        // asli) yang wajar hilang bareng koneksi ini.
        s.conn = null;
        s.connInfo = null;
        for (const name of Object.keys(s.services) as ServiceName[]) {
          if (isBackgroundService(name)) continue;
          if (s.services[name].status !== "stopped") {
            s.services[name] = freshServiceState();
            appendLog(name, "[system] Koneksi SSH terputus -- service dianggap berhenti.");
          }
        }
        s.logTailStreams = {};
        s.cameraOpen = false;
        s.cameraServer?.close();
        s.cameraServer = null;
      });
      resolve({ ok: true });
    });
    conn.on("error", (err) => {
      clearTimeout(timeout);
      s.connecting = false;
      s.conn = null;
      resolve({ ok: false, error: err.message });
    });
    // Password kosong -> coba key-based auth pakai default private key
    // laptop ini (~/.ssh/id_ed25519), yang di setup ini SUDAH di-authorize
    // (passwordless) ke raspi lewat ssh-copy-id sebelumnya -- konsisten
    // dengan cara SSH manual yang sudah dipakai sepanjang proyek ini.
    const defaultKeyPath = path.join(os.homedir(), ".ssh", "id_ed25519");
    const privateKey =
      opts.password.length === 0 && fs.existsSync(defaultKeyPath)
        ? fs.readFileSync(defaultKeyPath)
        : undefined;
    conn.connect({
      host: opts.host,
      port: opts.port,
      username: opts.username,
      password: privateKey ? undefined : opts.password,
      privateKey,
      readyTimeout: 9000,
    });
  });
}

export function disconnect() {
  const s = state();
  for (const name of Object.keys(s.streams) as ServiceName[]) {
    s.streams[name]?.close();
  }
  for (const name of Object.keys(s.logTailStreams) as BackgroundServiceName[]) {
    s.logTailStreams[name]?.close();
  }
  s.logTailStreams = {};
  s.cameraServer?.close();
  s.cameraServer = null;
  s.cameraOpen = false;
  s.conn?.end();
  s.conn = null;
  s.connInfo = null;
  // mavros/rtkRelay TIDAK direset -- proses aslinya di raspi tetap jalan
  // (fire-and-forget, lihat commandFor()), cuma channel/tail dari SESI INI
  // yang ditutup. Status sebenarnya dicek ulang dari pgrep saat reconnect.
  for (const name of Object.keys(s.services) as ServiceName[]) {
    if (isBackgroundService(name)) continue;
    s.services[name] = freshServiceState();
  }
  // Channel exec build ikut tertutup bareng koneksi -- reset statusnya
  // supaya tombol Build tidak nyangkut permanen di "building" kalau SSH
  // putus di tengah build.
  if (s.missionBuild === "building") {
    s.missionBuild = "idle";
  }
}

// Buffer baris JSON parsial per stream telemetry (data event bisa memotong
// tengah baris JSON -- lihat handleTelemetryChunk()).
const telemetryLineBuffers = new Map<ServiceName, string>();

function handleTelemetryChunk(s: GlobalSshState, chunk: Buffer, bufferKey: ServiceName) {
  const prev = telemetryLineBuffers.get(bufferKey) ?? "";
  const combined = prev + chunk.toString("utf8");
  const lines = combined.split("\n");
  telemetryLineBuffers.set(bufferKey, lines.pop() ?? "");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const msg = JSON.parse(trimmed) as { topic?: string } & Record<string, unknown>;
      const ts = Date.now();
      switch (msg.topic) {
        case "/mavros/state":
          s.telemetry.state = {
            connected: Boolean(msg.connected),
            armed: Boolean(msg.armed),
            guided: Boolean(msg.guided),
            mode: String(msg.mode ?? ""),
            ts,
          };
          break;
        case "/mavros/local_position/pose":
          s.telemetry.localPose = {
            x: Number(msg.x), y: Number(msg.y), z: Number(msg.z), ts,
          };
          break;
        case "/mavros/global_position/global":
          s.telemetry.globalPose = {
            lat: Number(msg.lat), lon: Number(msg.lon), alt: Number(msg.alt), ts,
          };
          break;
        case "/mavros/vfr_hud":
          s.telemetry.vfrHud = {
            groundspeed: Number(msg.groundspeed),
            altitude: Number(msg.altitude),
            climb: Number(msg.climb),
            heading: Number(msg.heading),
            ts,
          };
          break;
        case "/mavros/gpsstatus/gps1/raw":
          s.telemetry.gpsRaw = {
            fixType: Number(msg.fix_type),
            satellitesVisible: Number(msg.satellites_visible),
            hdop: msg.hdop === null || msg.hdop === undefined ? null : Number(msg.hdop),
            vdop: msg.vdop === null || msg.vdop === undefined ? null : Number(msg.vdop),
            ts,
          };
          break;
        case "/mavros/battery":
          s.telemetry.battery = {
            voltage: Number(msg.voltage),
            current: Number(msg.current),
            percentage: Number(msg.percentage),
            ts,
          };
          break;
        case "/livox/lateral_distance":
          s.telemetry.livoxLateral = {
            frontCm: msg.front_cm === null || msg.front_cm === undefined ? null : Number(msg.front_cm),
            backCm: msg.back_cm === null || msg.back_cm === undefined ? null : Number(msg.back_cm),
            leftCm: msg.left_cm === null || msg.left_cm === undefined ? null : Number(msg.left_cm),
            rightCm: msg.right_cm === null || msg.right_cm === undefined ? null : Number(msg.right_cm),
            ts,
          };
          break;
        case "/fiducial/fps":
          s.telemetry.fiducialFps = { fps: Number(msg.fps), ts };
          break;
        case "/mavros/imu/data":
          s.telemetry.imu = {
            rollDeg: Number(msg.roll_deg),
            pitchDeg: Number(msg.pitch_deg),
            yawDeg: Number(msg.yaw_deg),
            gyroXDps: Number(msg.gyro_x_dps),
            gyroYDps: Number(msg.gyro_y_dps),
            gyroZDps: Number(msg.gyro_z_dps),
            accelX: Number(msg.accel_x),
            accelY: Number(msg.accel_y),
            accelZ: Number(msg.accel_z),
            ts,
          };
          break;
        case "/mavros/setpoint_raw/target_attitude":
          s.telemetry.attitudeTarget = {
            rollDeg: Number(msg.roll_deg),
            pitchDeg: Number(msg.pitch_deg),
            yawDeg: Number(msg.yaw_deg),
            rollRateDps: Number(msg.roll_rate_dps),
            pitchRateDps: Number(msg.pitch_rate_dps),
            yawRateDps: Number(msg.yaw_rate_dps),
            thrust: Number(msg.thrust),
            ts,
          };
          break;
        case "/mavros/rc/out":
          s.telemetry.motorOut = {
            channels: Array.isArray(msg.channels) ? msg.channels.map(Number) : [],
            ts,
          };
          break;
        case "/mavros/estimator_status":
          s.telemetry.estimatorStatus = {
            attitude: Boolean(msg.attitude),
            velocityHoriz: Boolean(msg.velocity_horiz),
            velocityVert: Boolean(msg.velocity_vert),
            posHorizRel: Boolean(msg.pos_horiz_rel),
            posHorizAbs: Boolean(msg.pos_horiz_abs),
            posVertAbs: Boolean(msg.pos_vert_abs),
            posVertAgl: Boolean(msg.pos_vert_agl),
            constPosMode: Boolean(msg.const_pos_mode),
            gpsGlitch: Boolean(msg.gps_glitch),
            accelError: Boolean(msg.accel_error),
            ts,
          };
          break;
        case "/mavros/imu/static_pressure":
          s.telemetry.baro = { pressureHpa: Number(msg.pressure_hpa), ts };
          break;
        case "/mavros/altitude":
          // 2026-09-16 (atas permintaan user, debug bug "altitude tidak mau
          // turun") -- 4 referensi altitude berbeda sekaligus, ditampilkan
          // di web supaya operator lihat langsung kalau ada selisih antar
          // referensi. null (dari telemetry_bridge.py, NaN->None) tetap
          // null di sini, BUKAN di-paksa 0 -- field ini optional di UI.
          s.telemetry.altitude = {
            amsl: msg.amsl === null ? null : Number(msg.amsl),
            local: msg.local === null ? null : Number(msg.local),
            relative: msg.relative === null ? null : Number(msg.relative),
            terrain: msg.terrain === null ? null : Number(msg.terrain),
            bottomClearance: msg.bottom_clearance === null ? null : Number(msg.bottom_clearance),
            ts,
          };
          break;
        default:
          break;
      }
    } catch {
      // Baris bukan JSON valid (mis. log rclpy/ROS biasa) -- abaikan diam-diam,
      // BUKAN error, telemetry_bridge.py juga print INFO log biasa saat start.
    }
  }
}

export function getTelemetry(): TelemetryData {
  return { ...state().telemetry };
}

export function startService(
  name: ServiceName,
  missionOpts?: MissionStartOpts,
): { ok: true } | { ok: false; error: string } {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  if (s.services[name].status === "running" || s.services[name].status === "starting") {
    return { ok: false, error: `${name} sudah jalan/sedang start.` };
  }
  if (name === "rtkRelay") {
    s.rtkRunner = missionOpts?.rtkRunner === "str2str" ? "str2str" : "udp";
  }
  const command = commandFor(name, missionOpts);
  if (isBackgroundService(name)) {
    // Fire-and-forget: exec ini cuma menjalankan victus.sh/start.sh, yang
    // men-daemonize (nohup+disown) proses aslinya sendiri lalu exit --
    // TIDAK ditahan channel-nya seperti service lain (lihat commandFor()).
    // Status "running" yang sebenarnya nanti dikonfirmasi oleh
    // pollBackgroundStatus() lewat pgrep, begitu round polling berikutnya
    // jalan (dipanggil dari getStatus(), ~tiap 2 detik dari frontend) --
    // di sini cuma optimistically ditandai "starting" dulu.
    s.services[name] = { status: "starting", startedAt: null, lastError: null };
    appendLog(name, `[system] Menjalankan (background): ${command}`);
    const conn = s.conn;
    execCapture(conn, command)
      .then(({ code, stdout, stderr }) => {
        for (const line of stdout.split("\n")) {
          if (line.trim().length > 0) appendLog(name, line);
        }
        // 2026-09-14 bugfix: exit code start.sh SEBELUMNYA tidak pernah
        // dicek sama sekali -- kalau script-nya exit non-zero (mis. device
        // serial tidak terdeteksi di USB bus, lihat start.sh raspi), status
        // di sini TETAP "starting" selamanya (pollBackgroundStatus() lewat
        // pgrep juga tidak akan pernah menemukan proses yang memang tidak
        // pernah benar-benar start), TANPA error yang kelihatan di UI sama
        // sekali. Sekarang: exit non-zero -> "error" langsung, pesan dari
        // stderr script (baru ditangkap execCapture(), lihat di atas).
        if (code !== 0) {
          const msg = stderr.trim() || `start.sh keluar dengan kode ${code}`;
          s.services[name] = { status: "error", startedAt: null, lastError: msg };
          appendLog(name, `[system] ${msg}`);
        }
      })
      .catch((err: Error) => {
        s.services[name] = { status: "error", startedAt: null, lastError: err.message };
        appendLog(name, `[system] Gagal menjalankan script: ${err.message}`);
      });
    return { ok: true };
  }
  const usePty = name === "mission";
  s.services[name] = { status: "starting", startedAt: null, lastError: null };
  appendLog(name, `[system] Menjalankan: ${command}`);
  // 2026-09-13 bugfix: kalau channel SSH habis (sshd MaxSessions, dsb --
  // pernah kejadian nyata di sesi ini), conn.exec()'s callback bisa TIDAK
  // PERNAH dipanggil sama sekali -- status service macet "starting"
  // selamanya tanpa ada error yang kelihatan. Timer ini cuma menandai error
  // di UI kalau itu terjadi; tidak benar-benar membatalkan exec yang
  // menggantung (ssh2 tidak punya API untuk itu).
  const execStuckTimer = setTimeout(() => {
    if (s.services[name].status === "starting") {
      s.services[name] = {
        status: "error",
        startedAt: null,
        lastError: "Exec tidak merespon (kemungkinan channel SSH habis) -- coba disconnect/connect ulang.",
      };
      appendLog(name, "[system] Timeout menunggu exec -- coba disconnect/connect ulang SSH.");
    }
  }, EXEC_CAPTURE_TIMEOUT_MS);
  const onExec = (err: Error | undefined, stream: ClientChannel) => {
    clearTimeout(execStuckTimer);
    if (err) {
      s.services[name] = { status: "error", startedAt: null, lastError: err.message };
      appendLog(name, `[system] Gagal exec: ${err.message}`);
      return;
    }
    s.streams[name] = stream;
    s.services[name] = { status: "running", startedAt: Date.now(), lastError: null };
    if (name === "telemetry" || name === "livox") {
      stream.on("data", (data: Buffer) => handleTelemetryChunk(s, data, name));
    } else {
      stream.on("data", (data: Buffer) => appendLog(name, data.toString("utf8")));
    }
    stream.stderr.on("data", (data: Buffer) => appendLog(name, data.toString("utf8")));
    stream.on("close", (code: number | null) => {
      delete s.streams[name];
      if (s.services[name].status !== "stopped") {
        appendLog(name, `[system] Proses berhenti (exit code ${code ?? "?"}).`);
        s.services[name] = { status: "stopped", startedAt: null, lastError: null };
      }
      if (name === "telemetry") {
        s.telemetry = {};
        telemetryLineBuffers.delete("telemetry");
      }
      if (name === "livox") {
        delete s.telemetry.livoxLateral;
        telemetryLineBuffers.delete("livox");
      }
      // Vision berhenti -> mjpegStreamer (kalau jalan) ikut dihentikan,
      // tidak ada gunanya nge-stream tanpa sumber gambar. fiducialFps juga
      // dihapus -- topic /fiducial/fps tidak ada publisher-nya lagi begitu
      // vision mati, biarkan widget VISION balik ke "--" bukan angka basi.
      if (name === "vision") {
        delete s.telemetry.fiducialFps;
        if (s.streams.mjpegStreamer) {
          stopService("mjpegStreamer");
        }
      }
      // Catatan: cascade auto-start/stop telemetry berdasarkan status
      // MAVROS SUDAH DIPINDAH ke pollBackgroundStatus() (2026-09-13) --
      // MAVROS sekarang fire-and-forget lewat victus.sh, tidak lagi lewat
      // exec channel/onExec ini sama sekali (lihat isBackgroundService()
      // branch di atas), jadi tidak ada lagi cascade di sini untuk mavros.
    });
    // Vision berhasil start -> otomatis nyalakan mjpeg_streamer juga, TIDAK
    // perlu tombol terpisah (CameraPanel cuma butuh port 8090 terisi).
    if (name === "vision" && s.services.mjpegStreamer.status === "stopped") {
      startService("mjpegStreamer");
    }
  };
  if (usePty) {
    s.conn.exec(command, { pty: {} }, onExec);
  } else {
    s.conn.exec(command, onExec);
  }
  return { ok: true };
}

export function stopService(name: ServiceName): { ok: true } | { ok: false; error: string } {
  const s = state();
  if (isBackgroundService(name)) {
    if (!s.conn) {
      return { ok: false, error: "Belum connect SSH." };
    }
    if (s.services[name].status !== "running" && s.services[name].status !== "starting") {
      return { ok: false, error: `${name} tidak sedang berjalan.` };
    }
    const conn = s.conn;
    s.services[name] = { status: "stopping", startedAt: s.services[name].startedAt, lastError: null };
    appendLog(name, "[system] Menghentikan (pkill -INT ke proses leader)...");
    // Signal ke proses LEADER (ros2 launch, atau rtk_rover_relay.py sendiri
    // untuk rtkRelay yang bukan ros2 launch) -- graceful dulu, cascade ke
    // child kalau ada (lihat STOP_LEADER_PATTERN), fallback -9 ~2 detik
    // kemudian kalau masih hidup (mavros_node/rtk_rover_relay.py leaf).
    const leaderPattern = selfSafePgrepPattern(stopLeaderPatternFor(s, name));
    const leafPattern = selfSafePgrepPattern(livenessPatternFor(s, name));
    execCapture(conn, `pkill -INT -f "${leaderPattern}"`).catch(() => {});
    setTimeout(() => {
      execCapture(conn, `pgrep -f "${leafPattern}"`)
        .then(({ code }) => {
          if (code === 0) {
            appendLog(name, "[system] Masih hidup setelah SIGINT -- pkill -9 (paksa).");
            execCapture(conn, `pkill -9 -f "${leaderPattern}"; pkill -9 -f "${leafPattern}"`).catch(() => {});
          }
        })
        .catch(() => {});
      // pollBackgroundStatus() (dipicu getStatus() berikutnya) yang akan
      // mengoreksi status jadi "stopped" begitu pgrep benar-benar kosong --
      // di sini tidak langsung set "stopped" supaya tidak race dengan itu.
    }, 2000);
    stopLogTail(name);
    return { ok: true };
  }
  const stream = s.streams[name];
  if (!stream) {
    return { ok: false, error: `${name} tidak sedang berjalan.` };
  }
  s.services[name] = { status: "stopping", startedAt: s.services[name].startedAt, lastError: null };
  appendLog(name, "[system] Menghentikan (SIGINT)...");
  try {
    stream.signal("INT");
  } catch {
    // Server SSH mungkin tidak dukung signal request -- lanjut close saja.
  }
  setTimeout(() => {
    stream.close();
  }, 1500);
  return { ok: true };
}

// Kirim data mentah ke stdin/tty proses yang sedang berjalan (dipakai
// mission: tulis "1" untuk gerbang keypress "Tekan 1 untuk lanjut
// takeoff..." di mission_node.cpp -- WAJIB service ini di-start dengan pty
// (lihat startService(), usePty), kalau tidak /dev/tty tidak ada sama
// sekali di sisi remote, tidak ada yang menerima data ini).
export function sendKey(name: ServiceName, data: string): { ok: true } | { ok: false; error: string } {
  const s = state();
  const stream = s.streams[name];
  if (!stream) {
    return { ok: false, error: `${name} tidak sedang berjalan.` };
  }
  stream.write(data);
  return { ok: true };
}

export function startCameraTunnel(): { ok: true } | { ok: false; error: string } {
  const s = state();
  if (!s.conn) {
    return { ok: false, error: "Belum connect SSH." };
  }
  if (s.cameraServer) {
    return { ok: false, error: "Tunnel kamera sudah terbuka." };
  }
  const conn = s.conn;
  const server = net.createServer((socket) => {
    conn.forwardOut(
      "127.0.0.1",
      0,
      "127.0.0.1",
      CAMERA_REMOTE_PORT,
      (err, stream) => {
        if (err) {
          socket.end();
          return;
        }
        socket.pipe(stream);
        stream.pipe(socket);
      },
    );
  });
  server.on("error", () => {
    s.cameraOpen = false;
    s.cameraServer = null;
  });
  server.listen(CAMERA_LOCAL_PORT, "127.0.0.1", () => {
    s.cameraOpen = true;
  });
  s.cameraServer = server;
  return { ok: true };
}

export function stopCameraTunnel() {
  const s = state();
  s.cameraServer?.close();
  s.cameraServer = null;
  s.cameraOpen = false;
}
