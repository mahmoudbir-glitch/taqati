# طاقتي — Taqati

منصة ذكية لمراقبة وإدارة أنظمة الطاقة الشمسية.

> هذا المشروع مستقل بالكامل عن Shamsak.

## Architecture

- `apps/web` — واجهة Taqati (Next.js / TypeScript / PWA)
- `apps/api` — API والخدمات الخلفية (NestJS)
- `apps/gateway` — بوابة الاتصال المحلية مع الإنفرتر
- `packages/*` — مكتبات مشتركة والبروتوكولات والتحقق وقاعدة البيانات
- `infrastructure/*` — Docker / MQTT / PostgreSQL
- `docs/*` — التوثيق المعماري والتقني

## Core data flow

`Inverter → Modbus → Taqati Gateway → MQTT/TLS → Taqati Cloud → API/WebSocket → Taqati App`

## Status

مرحلة التأسيس — MVP-01.
