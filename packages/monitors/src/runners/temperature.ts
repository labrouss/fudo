/**
 * Inlet (intake) air temperature from a server's BMC over Redfish: the air entering the server from
 * the cold aisle, so a good thermometer for the front of its rack. Reads Chassis/<id>/Thermal
 * (iLO 4/5/6, iDRAC, …) and falls back to ThermalSubsystem/ThermalMetrics (newer Redfish).
 */
import type { MsgPart } from "@fudo/shared";
import { down, elapsed, errorPart, result, type Runner } from "./types.js";
import { redfishGetter } from "./redfish.js";

export interface Reading { sensor: string; celsius: number | null; state: string | null }
const INLET = /inlet|intake|ambient/i;
const usable = (state: string | null) => !state || state === "Enabled";

/** The inlet sensor of a Thermal resource: by name if one is given, else the Intake context, else an inlet-like name. */
export function pickFromThermal(thermal: Record<string, any>, name: string): Reading | null | "none" {
  const temps = (thermal.Temperatures ?? []) as Array<Record<string, any>>;
  if (!temps.length) return "none";
  const want = name.trim().toLowerCase();
  const t = want ? temps.find((x) => String(x.Name ?? "").toLowerCase().includes(want))
    : temps.find((x) => x.PhysicalContext === "Intake") ?? temps.find((x) => INLET.test(String(x.Name ?? "")));
  if (!t) return null;
  return { sensor: String(t.Name ?? "Inlet"), celsius: typeof t.ReadingCelsius === "number" ? t.ReadingCelsius : null, state: t.Status?.State ?? null };
}
/** ThermalMetrics: the standard intake summary, else a matching reading. */
export function pickFromMetrics(m: Record<string, any>, name: string): Reading | null {
  const want = name.trim().toLowerCase();
  const list = (m.TemperatureReadingsCelsius ?? []) as Array<Record<string, any>>;
  if (!want && typeof m.TemperatureSummaryCelsius?.Intake?.Reading === "number") return { sensor: "Intake", celsius: m.TemperatureSummaryCelsius.Intake.Reading, state: null };
  const r = list.find((x) => (want ? `${x.DeviceName ?? ""} ${x.DataSourceUri ?? ""}`.toLowerCase().includes(want) : INLET.test(`${x.DeviceName ?? ""} ${x.DataSourceUri ?? ""}`)));
  return r ? { sensor: String(r.DeviceName ?? "Inlet"), celsius: typeof r.Reading === "number" ? r.Reading : null, state: null } : null;
}

/** Above critical: Down; above warning: Degraded. */
export function temperatureVerdict(r: Reading, warnC: number, criticalC: number) {
  const value = Math.round(r.celsius! * 10) / 10;
  if (value >= criticalC) return { status: "DOWN" as const, parts: [["temp.high", { sensor: r.sensor, value, limit: criticalC }]] as MsgPart[] };
  if (value >= warnC) return { status: "DEGRADED" as const, parts: [["temp.high", { sensor: r.sensor, value, limit: warnC }]] as MsgPart[] };
  return { status: "UP" as const, parts: [["temp.ok", { sensor: r.sensor, value }]] as MsgPart[] };
}

/** Rise against the lowest recent reading (null without history). */
export function riseOf(value: number, recent: Array<{ value: number }> | undefined): number | null {
  if (!recent?.length) return null;
  return Math.round((value - Math.min(...recent.map((r) => r.value))) * 10) / 10;
}

export const temperatureRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const get = redfishGetter(cfg, ctx);
  const name = String(cfg.sensor ?? "");
  try {
    // the chassis: given, or the first (of a few) that reports temperatures
    const candidates = cfg.chassisPath ? [String(cfg.chassisPath)]
      : (((await get("/redfish/v1/Chassis")).Members ?? []) as Array<Record<string, string>>).map((m) => m["@odata.id"]).filter((p): p is string => typeof p === "string" && p.length > 0).slice(0, 4);
    if (!candidates.length) return down([["temp.noThermal"]], elapsed(start));
    let reading: Reading | null = null, sawThermal = false;
    for (const path of candidates) {
      const ch = await get(path);
      const thermalPath = ch.Thermal?.["@odata.id"];
      if (thermalPath) {
        const picked = pickFromThermal(await get(thermalPath), name);
        if (picked !== "none") { sawThermal = true; if (picked) { reading = picked; break; } }
      }
      const subsystem = ch.ThermalSubsystem?.["@odata.id"];
      if (!reading && subsystem) {
        const metricsPath = (await get(subsystem)).ThermalMetrics?.["@odata.id"];
        if (metricsPath) { sawThermal = true; reading = pickFromMetrics(await get(metricsPath), name); if (reading) break; }
      }
    }
    const ms = elapsed(start);
    if (!reading) return down([sawThermal ? ["temp.noSensor", { sensor: name || "Inlet / Intake" }] : ["temp.noThermal"]], ms);
    // an absent or disabled sensor, or no number, is never read as a temperature
    if (!usable(reading.state) || reading.celsius === null) return down([["temp.noReading", { sensor: reading.sensor, state: reading.state ?? "—" }]], ms);
    const value = Math.round(reading.celsius * 10) / 10;
    const v = temperatureVerdict(reading, Number(cfg.warnC ?? 27), Number(cfg.criticalC ?? 32));
    // rate of rise: the climb over the last minutes is the earliest sign of a cooling failure
    const rise = riseOf(value, ctx.recent);
    const riseLimit = Number(cfg.riseC ?? 0), minutes = Number(cfg.riseMin ?? 15);
    if (riseLimit > 0 && rise !== null && rise >= riseLimit) {
      const note: MsgPart = ["temp.rising", { rise, min: minutes }];
      return result(v.status === "UP" ? "DEGRADED" : v.status, ms, [...v.parts, note], { temperatureC: value, sensor: reading.sensor, riseC: rise });
    }
    return result(v.status, ms, v.parts, { temperatureC: value, sensor: reading.sensor, ...(rise === null ? {} : { riseC: rise }) });
  } catch (err) {
    return down([(err as { auth?: boolean }).auth ? ["auth.failedFor", { user: String(cfg.username) }] : errorPart(err, ctx.timeoutMs)], elapsed(start));
  }
};
