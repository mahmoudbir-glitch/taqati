# طاقتي — Taqati

منصة ذكية لمراقبة وإدارة أنظمة الطاقة الشمسية، مبنية كمنتج مستقل بالكامل عن Shamsak.

## البنية

- `apps/web` — واجهة Next.js 16 / React 19، RTL، mobile-first
- `apps/api` — NestJS API + استقبال Telemetry من MQTT
- `apps/gateway` — Gateway محلي، Modbus-ready، مع Mock Telemetry للتطوير
- `packages/database` — PostgreSQL + Prisma 7
- `packages/shared` — عقود Telemetry وMQTT المشتركة
- `packages/protocol` — واجهات Modbus وInverter Drivers
- `infrastructure/docker` — PostgreSQL + EMQX
- `docs` — التوثيق المعماري وMQTT

## تدفق البيانات

`Inverter → Modbus RTU/TCP → Taqati Gateway → MQTT/TLS → Taqati API → PostgreSQL → Dashboard`

الهاتف/المتصفح لا يتصل مباشرة بمنفذ COM أو RS485 داخل المنزل.

## تشغيل التطوير

1. انسخ `.env.example` إلى `.env`.
2. شغّل:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
pnpm install
pnpm db:generate
pnpm --filter @taqati/database exec prisma db push --config prisma.config.ts
pnpm typecheck
pnpm build
```

3. شغّل الخدمات:

```bash
pnpm --filter @taqati/api dev
pnpm --filter @taqati/gateway dev
pnpm --filter @taqati/web dev
```

افتراضياً يقوم Gateway بإرسال بيانات تجريبية كل 5 ثوانٍ عندما يكون `MOCK_TELEMETRY=true`.

## API

- `GET /api/health`
- `GET /api/sites/:siteId/telemetry/latest?limit=60`

## MQTT

- `taqati/v1/sites/{siteId}/gateways/{gatewayId}/telemetry`
- `taqati/v1/sites/{siteId}/gateways/{gatewayId}/status`
- `taqati/v1/sites/{siteId}/gateways/{gatewayId}/commands`
- `taqati/v1/sites/{siteId}/gateways/{gatewayId}/ack`

## الأمان

الإنتاج يجب أن يستخدم MQTT over TLS، هوية مستقلة لكل Gateway، ACL على Topics، تدوير credentials، جلسات مستخدمين، RBAC، rate limiting، وسجل تدقيق للأوامر والتغييرات.

## الحالة

MVP-01: الأساس البرمجي، قاعدة البيانات، MQTT ingestion، Gateway mock، وDashboard live polling جاهزة للبناء والتحقق. دعم Modbus الفعلي ودرايفر Felicity يأتي فوق طبقة البروتوكول الموحدة ولا يغيّر مسار البيانات.
