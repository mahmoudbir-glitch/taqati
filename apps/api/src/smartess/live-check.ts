// Manual check against the real SmartESS service; reads only and stores nothing.
// Usage (from apps/api): SMARTESS_USERNAME=... SMARTESS_PASSWORD=... pnpm exec tsx src/smartess/live-check.ts
import { sha1, SmartessClient, type SmartessConfig } from "./smartess.client";
import { hasHeadlineData, mapLastData } from "./smartess.mapper";

async function main() {
  const { SMARTESS_USERNAME: username, SMARTESS_PASSWORD: password } = process.env;
  if (!username || !password) throw new Error("SMARTESS_USERNAME and SMARTESS_PASSWORD are required");

  const account: SmartessConfig = {
    baseUrl: process.env.SMARTESS_API_BASE || "https://api.dessmonitor.com/public/",
    username,
    passwordSha1: sha1(password),
    companyKey: process.env.SMARTESS_COMPANY_KEY || "bnrl_frRFjEz8Mkn",
    source: "1",
  };
  const devices = await new SmartessClient(account).listDevices();
  console.log(`devices: ${devices.length}`, devices.map((device) => ({ ...device, pn: `…${device.pn.slice(-4)}`, sn: `…${device.sn.slice(-4)}` })));
  const [device] = devices;
  if (!device) return;

  const data = await new SmartessClient({ ...account, device }).fetchLastData(hasHeadlineData);
  const reading = mapLastData(data, { timezoneOffset: process.env.SMARTESS_TIMEZONE_OFFSET || "+03:00" });
  console.log(`parameters: ${data.pars.length}, gts: ${data.gts}, now: ${new Date().toISOString()}`);
  console.log(JSON.stringify(reading, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
