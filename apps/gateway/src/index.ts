import "./env.js";
import mqtt from "mqtt";
import { MQTT_TOPICS, TaqatiTelemetryMessage } from "@taqati/shared";

const mqttUrl = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const gatewayId = process.env.GATEWAY_ID ?? "development-gateway";
const siteId = process.env.SITE_ID ?? "development-site";
const mockTelemetry = process.env.MOCK_TELEMETRY !== "false";

const statusTopic = MQTT_TOPICS.status(siteId, gatewayId);
const statusPayload = (status: "ONLINE" | "OFFLINE") =>
  JSON.stringify({ gatewayId, status, timestamp: new Date().toISOString() });

const client = mqtt.connect(mqttUrl, {
  // An empty value in .env means "no credentials", not an empty username.
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  reconnectPeriod: 5000,
  // Last Will: the broker reports OFFLINE for us if the connection drops.
  will: { topic: statusTopic, payload: statusPayload("OFFLINE"), qos: 1, retain: true },
});

let sequence = 0;
let telemetryTimer: NodeJS.Timeout | undefined;

client.on("connect", () => {
  client.publish(statusTopic, statusPayload("ONLINE"), { qos: 1, retain: true });

  console.log(`[gateway] connected to MQTT as ${gatewayId}`);

  if (mockTelemetry && !telemetryTimer) {
    telemetryTimer = setInterval(() => publishMockTelemetry(), 5000);
    publishMockTelemetry();
  }
});

function publishMockTelemetry() {
  const solarPowerW = Math.round(4200 + Math.sin(Date.now() / 90000) * 600);
  const loadPowerW = Math.round(2100 + Math.sin(Date.now() / 70000) * 300);
  // The mock site never touches the grid: the battery absorbs or covers the difference.
  const batteryPowerW = solarPowerW - loadPowerW;
  const message: TaqatiTelemetryMessage = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    inverter: {
      status: "online",
      solarPowerW,
      loadPowerW,
      gridPowerW: 0,
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
  // A clean disconnect does not trigger the Last Will, so say OFFLINE explicitly.
  client.publish(statusTopic, statusPayload("OFFLINE"), { qos: 1, retain: true }, () => {
    client.end(false, {}, () => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
