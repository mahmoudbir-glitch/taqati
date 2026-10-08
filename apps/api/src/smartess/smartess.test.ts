import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceFromSn, parseLastData, type SmartessPar } from "./smartess.client";
import { decryptSecret, encryptSecret } from "./smartess.crypto";
import { extractReading, mapDayRows, mapLastData, parseGts } from "./smartess.mapper";

const par = (name: string, val: string, unit?: string): SmartessPar => ({ id: "", par: name, val, unit });
const options = { timezoneOffset: "+03:00", now: new Date("2026-10-08T10:00:00Z") };

test("deviceFromSn splits PN + devcode + devaddr", () => {
  assert.deepEqual(deviceFromSn("Q001", "Q0010A0102"), { pn: "Q001", sn: "Q0010A0102", devcode: 0x0a01, devaddr: 2 });
  assert.equal(deviceFromSn("Q001", "X0010A0102"), null);
  assert.equal(deviceFromSn("Q001", "Q001ZZZZZZ"), null);
});

test("parseLastData finds parameters at any depth", () => {
  const data = parseLastData({ gts: "2026-10-08 12:00:00", pars: { a_: [{ par: "PV Power", val: "10", unit: "W" }], b_: [{ name: "Load", value: 5 }] } });
  assert.equal(data.gts, "2026-10-08 12:00:00");
  assert.deepEqual(data.pars.map((item) => [item.par, item.val]), [["PV Power", "10"], ["Load", "5"]]);
});

test("kilowatt values are converted to watts", () => {
  const reading = extractReading([par("AC Output Active Power", "1.25", "kW"), par("PV Power", "3.4", "kW")]);
  assert.equal(reading.loadPowerW, 1250);
  assert.equal(reading.solarPowerW, 3400);
});

test("blank values are missing, not zero", () => {
  const reading = extractReading([par("Grid Voltage", "--", "V"), par("Grid Power", "", "W")]);
  assert.equal(reading.gridVoltageV, undefined);
  assert.equal(reading.gridPowerW, undefined);
});

test("the larger of the PV power labels wins", () => {
  const reading = extractReading([par("PV Power", "0", "W"), par("PV Charge Power", "900", "W")]);
  assert.equal(reading.solarPowerW, 900);
});

test("one-way battery currents give the direction", () => {
  const discharging = mapLastData(
    { pars: [par("Battery Voltage", "50", "V"), par("Battery Charging Current", "0", "A"), par("Battery Discharge Current", "25", "A"), par("Battery Capacity", "64", "%")] },
    options,
  );
  assert.equal(discharging?.battery?.direction, "discharging");
  assert.equal(discharging?.battery?.currentA, 25);
  assert.equal(discharging?.battery?.powerW, 1250);

  const charging = mapLastData(
    { pars: [par("Battery Voltage", "50", "V"), par("Battery Charging Current", "10", "A"), par("Battery Discharge Current", "0", "A"), par("Battery Capacity", "64", "%")] },
    options,
  );
  assert.equal(charging?.battery?.direction, "charging");
});

test("unrecognizable data maps to null", () => {
  assert.equal(mapLastData({ pars: [par("Firmware", "1.2")] }, options), null);
});

test("gts is read in the device time zone", () => {
  assert.equal(parseGts("2026-10-08 12:00:00", "+03:00", options.now).toISOString(), "2026-10-08T09:00:00.000Z");
  assert.equal(parseGts("garbage", "+03:00", options.now), options.now);
});

test("epoch gts is local wall-clock time encoded as UTC+8", () => {
  // Captured from the live service at about 12:10Z: a 15:04:16 reading in UTC+3.
  const now = new Date("2026-10-08T12:10:00Z");
  assert.equal(parseGts("1791443056303", "+03:00", now).toISOString(), "2026-10-08T12:04:16.303Z");
  assert.equal(parseGts("1791443056", "+03:00", now).toISOString(), "2026-10-08T12:04:16.000Z");
  // A shifted value that would be in the future falls back to the raw epoch.
  assert.equal(parseGts("1791443056303", "+03:00", new Date("2026-10-08T08:00:00Z")).toISOString(), "2026-10-08T07:04:16.303Z");
});

test("the day table maps to signed readings, oldest first", () => {
  const titles = ["id", "Timestamp", "Grid Power", "Output Active Power", "Battery Voltage", "Battery Current", "Battery Power", "PV Power", "PV Charge Power", "Battery Current"];
  const readings = mapDayRows(
    {
      titles,
      rows: [
        ["b", "2026-10-08 15:04:16", "0", "1126", "50.0", "12.6", "595", "1817", "595", "99"],
        ["a", "2026-10-08 02:00:00", "0", "400", "49.0", "8.2", "400", "0", "0", "99"],
        ["x", "not a time", "0", "0", "0", "0", "0", "0", "0", "0"],
      ],
    },
    "+03:00",
  );
  assert.equal(readings.length, 2);
  assert.equal(readings[0]?.timestamp, "2026-10-07T23:00:00.000Z");
  assert.equal(readings[0]?.batteryPowerW, -400, "no sun and a load means the battery is discharging");
  assert.equal(readings[0]?.batteryCurrentA, -8.2, "the first Battery Current column is used");
  assert.equal(readings[1]?.batteryPowerW, 595);
  assert.equal(readings[1]?.solarPowerW, 1817);
});

test("stored secrets round-trip and reject a different key", () => {
  process.env.SMARTESS_CONFIG_SECRET = "first-secret";
  const stored = encryptSecret("sha1-of-password");
  assert.notEqual(stored, encryptSecret("sha1-of-password"), "a fresh IV is used every time");
  assert.ok(!stored.includes("sha1-of-password"));
  assert.equal(decryptSecret(stored), "sha1-of-password");
  process.env.SMARTESS_CONFIG_SECRET = "second-secret";
  assert.throws(() => decryptSecret(stored));
});
