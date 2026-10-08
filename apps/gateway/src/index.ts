import mqtt from "mqtt";

const mqttUrl = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const gatewayId = process.env.GATEWAY_ID ?? "development-gateway";

const client = mqtt.connect(mqttUrl, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 5000,
});

client.on("connect", () => {
  const topic = `taqati/v1/gateways/${gatewayId}/status`;
  client.publish(topic, JSON.stringify({
    gatewayId,
    status: "ONLINE",
    timestamp: new Date().toISOString(),
  }), { qos: 1, retain: true });
  console.log(`[gateway] connected to MQTT as ${gatewayId}`);
});

client.on("error", (error) => {
  console.error("[gateway] MQTT error", error);
});

process.on("SIGTERM", () => client.end(false, {}, () => process.exit(0)));
process.on("SIGINT", () => client.end(false, {}, () => process.exit(0)));
