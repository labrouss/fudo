import { describe, expect, it } from "vitest";
import { pickFromMetrics, pickFromThermal, temperatureVerdict } from "../src/runners/temperature.js";

// shapes as HPE iLO 5 and Dell iDRAC return them
const ilo = { Temperatures: [
  { Name: "01-Inlet Ambient", PhysicalContext: "Intake", ReadingCelsius: 22, Status: { Health: "OK", State: "Enabled" }, UpperThresholdCritical: 42 },
  { Name: "02-CPU 1", PhysicalContext: "CPU", ReadingCelsius: 40, Status: { Health: "OK", State: "Enabled" } },
  { Name: "12-P/S 2 Inlet", PhysicalContext: "PowerSupply", ReadingCelsius: 31, Status: { Health: "OK", State: "Enabled" } },
] };
const idrac = { Temperatures: [{ Name: "System Board Exhaust Temp", ReadingCelsius: 35 }, { Name: "System Board Inlet Temp", ReadingCelsius: 24.5, Status: { State: "Enabled" } }] };

describe("inlet temperature", () => {
  it("finds the intake sensor (HPE iLO), not a power supply's inlet", () => {
    expect(pickFromThermal(ilo, "")).toEqual({ sensor: "01-Inlet Ambient", celsius: 22, state: "Enabled" });
  });
  it("finds an inlet by name when there is no Intake context (Dell iDRAC)", () => {
    expect(pickFromThermal(idrac, "")).toMatchObject({ sensor: "System Board Inlet Temp", celsius: 24.5 });
  });
  it("uses the given sensor name", () => {
    expect(pickFromThermal(ilo, "cpu 1")).toMatchObject({ sensor: "02-CPU 1", celsius: 40 });
    expect(pickFromThermal(ilo, "no such sensor")).toBeNull();
    expect(pickFromThermal({ Temperatures: [] }, "")).toBe("none");
  });
  it("reads the standard intake summary of ThermalMetrics (newer Redfish)", () => {
    expect(pickFromMetrics({ TemperatureSummaryCelsius: { Intake: { Reading: 23.4 } }, TemperatureReadingsCelsius: [] }, "")).toMatchObject({ sensor: "Intake", celsius: 23.4 });
    expect(pickFromMetrics({ TemperatureReadingsCelsius: [{ DeviceName: "Inlet", Reading: 21 }] }, "")).toMatchObject({ celsius: 21 });
  });
  it("keeps an absent sensor's state, so it is never read as a temperature", () => {
    expect(pickFromThermal({ Temperatures: [{ Name: "01-Inlet Ambient", PhysicalContext: "Intake", ReadingCelsius: 0, Status: { State: "Absent" } }] }, "")).toMatchObject({ state: "Absent" });
  });
  it("Degraded from the warning, Down from the critical temperature", () => {
    const r = (c: number) => temperatureVerdict({ sensor: "01-Inlet Ambient", celsius: c, state: "Enabled" }, 27, 32);
    expect(r(22).status).toBe("UP");
    expect(r(27).status).toBe("DEGRADED");
    expect(r(31.96).status).toBe("DOWN"); // rounds to 32.0
    expect(r(35.04).parts).toEqual([["temp.high", { sensor: "01-Inlet Ambient", value: 35, limit: 32 }]]);
  });
});
