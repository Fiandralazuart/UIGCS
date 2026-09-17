import { NextResponse } from "next/server";
import { getMissionYaml } from "@/lib/ssh-manager";
import { parseMissionYaml } from "@/lib/mission-yaml";

// Baca mission.yaml LANGSUNG dari raspi (source of truth) tiap kali dipanggil
// -- tidak ada cache di server ini, supaya panel Mission selalu menampilkan
// isi file yang sebenarnya (mis. setelah OLED/wp.launch.xml menulis ulang).
export async function GET() {
  const result = await getMissionYaml();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  const parsed = parseMissionYaml(result.text);
  return NextResponse.json({ ok: true, ...parsed });
}
