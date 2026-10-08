import mqtt from "mqtt";
import { MQTT_TOPICS, TaqatiTelemetryMessage } from "@taqati/shared";

const mqttUrl = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const gatewayId = process.env.GATEWAY_ID ?? "development-gateway";
const siteId = process.env.SITE_ID ?? "development-site";
const mockTelemetry = process.env.MOCK_TELEMETRY !== "false";

const client = mqtt.connect(mqttUrl, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 5000,
});

let sequence = 0;
let telemetryTimer: NodeJS.Timeout | undefined;

client.on("connect", () => {
  const statusTopic = MQTT_TOPICS.status(siteId, gatewayId);
  client.publish(
    statusTopic,
    JSON.stringify({
      gatewayId,
      status: "ONLINE",
      timestamp: new Date().toISOString(),
    }),
    { qos: 1, retain: true },
  );

  console.log(`[gateway] connected to MQTT as ${gatewayId}`);

  if (mockTelemetry && !telemetryTimer) {
    telemetryTimer = setInterval(() => publishMockTelemetry(), 5000);
    publishMockTelemetry();
  }
});

function publishMockTelemetry() {
  const solarPowerW = Math.round(4200 + Math.sin(Date.now() / 90000) * 600);
  const loadPowerW = Math.round(2100 + Math.sin(Date.now() / 70000) * 300);
  const batteryPowerW = solarPowerW - loadPowerW;
  const message: TaqatiTelemetryMessage = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    inverter: {
      status: "online",
      solarPowerW,
      loadPowerW,
      gridPowerW: Math.max(0, loadPowerW - solarPowerW),
      temperatureC: 39.5,
      gridVoltageV: 230,
      gridFrequencyHz: 50,
    },
    battery: {
      soc: 78,
      voltageV: 48.7,
      currentA: Math.round((Math.abs(batteryPowerW) / 48.7) * 10) / 10,
      powerW: Math.abs(batteryPowerW),
      direction: batteryPowerW >= 0 ? "charging" : "discharging",
    },
    meta: { sequence: ++sequence },
  };

  client.publish(MQTT_TOPICS.telemetry(siteId, gatewayId), JSON.stringify(message), { qos: 1 });
}

client.on("error", (error) => {
  console.error("[gateway] MQTT error", error);
});

function shutdown() {
  if (telemetryTimer) clearInterval(telemetryTimer);
  client.end(false, {}, () => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
