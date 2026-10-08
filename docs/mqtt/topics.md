# Taqati MQTT Topics v1

All device traffic uses authenticated MQTT over TLS in production.

## Telemetry

`taqati/v1/sites/{siteId}/gateways/{gatewayId}/telemetry`

Gateway publishes normalized telemetry. Recommended QoS: 1.

## Gateway status

`taqati/v1/sites/{siteId}/gateways/{gatewayId}/status`

Use retained status plus Last Will to distinguish ONLINE/OFFLINE.

## Commands

`taqati/v1/sites/{siteId}/gateways/{gatewayId}/commands`

Cloud publishes validated commands. Gateway must verify command identity and authorization context before touching the inverter.

## Acknowledgements

`taqati/v1/sites/{siteId}/gateways/{gatewayId}/ack`

Gateway reports receipt, inverter dispatch, completion, or failure.

Never place long-lived credentials or secrets inside QR payloads or MQTT topics.
