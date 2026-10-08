# Taqati Architecture

## System flow

```text
Inverter
   │
   ├── Modbus RTU / TCP
   ▼
Taqati Gateway
   │
   ├── MQTT over TLS
   ▼
Taqati Cloud
   │
   ├── REST API
   ├── WebSocket
   └── Alert Engine / FCM
   ▼
Taqati Web / PWA
```

## MVP-01

1. Authentication and organizations/sites
2. Gateway registration and QR pairing
3. MQTT/TLS device communication
4. Modbus RTU/TCP abstraction
5. First real inverter driver
6. Normalized telemetry
7. Live dashboard

## Design rules

- Cloud never accesses a home COM/RS485 port directly.
- Gateway and user identities are separate.
- Vendor-specific inverter registers stay inside drivers.
- The application consumes normalized telemetry.
- Commands always pass through authorization and safety validation.
- QR pairing tokens are short-lived and never contain long-lived secrets.
