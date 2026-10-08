# SmartESS device notes

Reference notes for an inverter monitored through the SmartESS app (v3.44.2.0).
Device identifiers (PN/SN), account name, installer and exact address are
intentionally **not** stored here because this repository is public; keep them in
environment variables or a secret store.

## Observed setup

| Item | Value |
| --- | --- |
| Data collector | Wi-Fi Plug Pro RTU |
| Link to the network | Wi-Fi |
| Collector firmware | 3.6.8.6 |
| Inverter link | RS485 / Modbus RTU, 9600 bps, 1 device attached |
| Collection interval | 5 min (standard: 5 min), no real-time acceleration package |
| Installed | 2023-12 |
| Country / timezone | Lebanon, GMT+3 (`Asia/Beirut`) |
| Currency | USD |
| Rated power field in SmartESS | shows `82` kW, which looks like a typo for a home system; verify |

## Data points shown in the app

Sample taken from one screen capture. Values are only examples.

| SmartESS label | Example | Taqati field (`TaqatiTelemetryMessage`) |
| --- | --- | --- |
| PV Power (solar) | 3 W | `inverter.solarPowerW` |
| Load | 1.51 kW | `inverter.loadPowerW` |
| Grid Power | 1622 W | `inverter.gridPowerW` |
| Grid Frequency | 50.00 Hz | `inverter.gridFrequencyHz` |
| Grid Voltage (available, not selected in the app) | n/a | `inverter.gridVoltageV` |
| Battery percentage | 37 % | `battery.soc` |
| Battery Voltage | 50.10 V | `battery.voltageV` |
| Battery Current | 2.10 A | `battery.currentA` |
| Battery Power | 105 W | `battery.powerW` + `battery.direction` |
| PV Voltage | 68.70 V | no field yet |
| PV Current | 0.00 A | no field yet |
| Output Voltage | 231.20 V | no field yet |
| Output Current / Frequency / Active Power / Apparent Power | n/a | no field yet |
| PV Charge Power, AC charging current, PV charging current | n/a | no field yet |

In the sample, grid import (1622 W) is roughly load (1510 W) plus battery (105 W),
so the battery was charging from the grid. Direction is not shown as a separate
value in the app; it has to be derived from the sign or the energy balance.

## Integration notes

- The Wi-Fi Plug Pro uses the inverter's RS485 port. A second Modbus master
  (the Taqati Gateway) cannot share that bus with it; use another port or
  remove the dongle.
- Cloud polling (implemented in `apps/api/src/smartess`) reads the SmartESS cloud
  every 5 minutes, which is how often the collector reports. It is off unless
  `SMARTESS_ENABLED=true`.
- Modbus settings that match this device (see `InverterConnection` in the Prisma
  schema): `MODBUS_RTU`, `baudRate` 9600, `slaveId` to be confirmed.

## Cloud polling

The API logs in to `api.dessmonitor.com` with the documented SHA-1 signing scheme,
calls `querySPDeviceLastData` and maps the parameters by their English label to
`TaqatiTelemetryMessage` (`apps/api/src/smartess/smartess.mapper.ts`). Values
without a first-class field are kept under `meta.extra` in the raw data. On start
it creates the default organization, site and gateway rows that telemetry
references.

Required variables (see `.env.example`): `SMARTESS_ENABLED`, `SMARTESS_USERNAME`,
`SMARTESS_PASSWORD` (or `SMARTESS_PASSWORD_SHA1`), `SMARTESS_DEVICE_PN`,
`SMARTESS_DEVICE_SN`. The SN is the PN followed by the device code (4 hex digits)
and the device address (2 hex digits), so `devcode` and `devaddr` are derived from
it. The company-key defaults to the public key the SmartESS web app uses.

Data is read with `querySPDeviceLastData`, falling back to `queryDeviceLastData`
and `webQueryDeviceEnergyFlowEs`; parameters from all of them are merged. Login
tries `authSource` and then `auth`. Parameters are matched on their English label
with the same rules the Solar project uses (for example, PV power is the largest
of "PV Power" and "PV Charge Power"). Assumption to confirm on the first real run:
grid power is positive when importing. The poller logs only error codes, never
tokens, signed URLs or credentials.

Never commit real values; keep them in the host's environment or secret store.
