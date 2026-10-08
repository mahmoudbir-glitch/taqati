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

1. انسخ `.env.example` إلى `.env` في جذر المستودع (كل الخدمات تقرأه من هناك).
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
- `GET /api/sites/:siteId/telemetry/series?since=<epoch ms>&bucketMinutes=5` — متوسطات القراءات في فترات زمنية ثابتة (للمخططات)
- `GET /api/sites/:siteId/telemetry/daily?days=30` — مجاميع الطاقة (Wh) لكل يوم بتوقيت الموقع

قدرة وتيار البطارية في الاستجابات وفي قاعدة البيانات **بإشارة**: موجب = شحن، سالب = تفريغ. رسائل MQTT ترسل القيمة المطلقة مع `direction` والـ API يحوّلها عند التخزين.

### SmartESS

- `GET /api/sites/:siteId/smartess` — حالة الربط (المعرّفات مقنّعة).
- `PUT /api/sites/:siteId/smartess` — حفظ الحساب وبدء السحب. الجسم: `username`, `password`, `devicePn`, `deviceSn`, `enabled`.
- `POST /api/sites/:siteId/smartess/test` — تجربة تسجيل الدخول والقراءة دون حفظ.
- `DELETE /api/sites/:siteId/smartess` — حذف الحساب المحفوظ.

للتحقق من حساب حقيقي دون تخزين أي شيء (من `apps/api`): `SMARTESS_USERNAME=... SMARTESS_PASSWORD=... pnpm exec tsx src/smartess/live-check.ts`.

ملاحظتان من الخدمة الحية: الرقم التسلسلي للجهاز لا يحتوي دائماً على عنوانه (مثل `DEV1A…`)، لذلك يُحفظ `devcode`/`devaddr` كما يعيدهما الحساب؛ و`gts` رقم epoch يمثّل توقيت الجهاز المحلي مرمّزاً كأنه UTC+8، فيُصحَّح إلى توقيت الموقع (`SMARTESS_TIMEZONE_OFFSET`).

`devicePn` و`deviceSn` اختياريان: عند تركهما يكتشف الخادم الجهاز من الحساب (يشترط وجود جهاز واحد). اسم المستخدم حساس لحالة الأحرف في SmartESS، فيُعاد تجريبه بالصيغ الشائعة عند «مستخدم غير موجود».

الثلاثة الأخيرة تتطلب `Authorization: Bearer <ADMIN_TOKEN>`؛ بدون ضبط `ADMIN_TOKEN` (16 حرفاً على الأقل) تبقى مغلقة. كلمة المرور تُخزَّن مشفّرة (AES-256-GCM) في جدول `SmartessConnection` ولا تُعاد في أي استجابة. الحساب المحفوظ من صفحة الإعدادات له الأولوية على متغيرات `SMARTESS_*`.

`WEB_ORIGIN` قائمة مفصولة بفواصل للمواقع المسموح لها بقراءة الـ API؛ بدونها يُسمح لأي موقع.

`AUTO_PROVISION_GATEWAYS=true` (للتطوير فقط) ينشئ صفوف الموقع والبوابة تلقائياً لأي بوابة ترسل عبر MQTT. في الإنتاج اتركه غير مضبوط: قراءات البوابة غير المسجّلة تُرفض.

## الواجهة

صفحات `apps/web`: الرئيسية `/`، الطاقة `/energy`، البطارية `/battery`، التنبيهات `/alerts`، الأجهزة `/devices`، الإعدادات `/settings`.

- عند ضبط `NEXT_PUBLIC_TAQATI_API_URL` و`NEXT_PUBLIC_TAQATI_SITE_ID` تعرض الواجهة قراءات حية من الـ API.
- عند غيابهما تعرض نموذجاً تجريبياً يُولَّد داخل المتصفح (`apps/web/lib/demo.ts`) وتُوسَم الواجهة بـ«بيانات تجريبية».
- التنبيهات وسجل الأحداث والمجاميع اليومية تُشتق من القراءات نفسها (`apps/web/lib/energy.ts`).
- صفحة الإعدادات تحتوي ربط حساب SmartESS فقط، ويُحفظ في الخادم (انظر قسم SmartESS). لا تُحفظ أي إعدادات في المتصفح.

## MQTT

- `taqati/v1/sites/{siteId}/gateways/{gatewayId}/telemetry`
- `taqati/v1/sites/{siteId}/gateways/{gatewayId}/status`
- `taqati/v1/sites/{siteId}/gateways/{gatewayId}/commands`
- `taqati/v1/sites/{siteId}/gateways/{gatewayId}/ack`

## الأمان

الإنتاج يجب أن يستخدم MQTT over TLS، هوية مستقلة لكل Gateway، ACL على Topics، تدوير credentials، جلسات مستخدمين، RBAC، rate limiting، وسجل تدقيق للأوامر والتغييرات.

## الحالة

MVP-01: الأساس البرمجي، قاعدة البيانات، MQTT ingestion، Gateway mock، وDashboard live polling جاهزة للبناء والتحقق. دعم Modbus الفعلي ودرايفر Felicity يأتي فوق طبقة البروتوكول الموحدة ولا يغيّر مسار البيانات.
