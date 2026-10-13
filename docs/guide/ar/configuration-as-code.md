<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# التكوين كرمز

يصدّر **التكوين** النطاق الحالي (الأصول والمراقبات والتطبيقات وتبعياتها) بصيغة YAML ويستورده مجددًا.
احفظه في git، أو انسخ إعداد مستأجر إلى آخر، أو أتمته عبر API.

```yaml
assets:
  - name: FIN-APPLIANCE-01
    kind: other
    dependsOn: [Core-SW-01]          # shared assets are referenced by name
monitors:
  - name: ERP web
    type: http
    config: { url: https://erp.corp.local/health, acceptedStatus: 200-299 }
    asset: FIN-APPLIANCE-01          # the asset this monitor checks
    tags: [prod]
applications:
  - name: ERP Production
    criticality: high
    slaTarget: 99.9
    members: [ERP web, { monitor: ERP SQL, required: false }]
    notify: [ERP team]               # notification channels, by name
```

## كيف يعمل الاستيراد

- **المعاينة أولًا**: تسرد ما سيُنشأ أو يتغير، حقلًا بحقل، وتُبلغ عن الأخطاء مع رقم السطر. و**التطبيق**
  يتم كاملًا أو لا يتم.
- **الملفات الجزئية آمنة**: العنصر الموجود في الملف يحدد ذلك العنصر؛ أما العناصر الغائبة عن الملف
  فتبقى كما هي.
- **غير مشمول**: قنوات الإشعارات وبيانات الاعتماد (فهي تحوي أسرارًا) ونوافذ الصيانة. تحصل مراقبات Push
  المستوردة على عناوين URL جديدة. وتذكر التطبيقات قنواتها بالاسم في `notify`؛ ومن دون `notify` يحتفظ
  التطبيق بقنواته الحالية.
- **بيانات الاعتماد المشتركة**: تذكر المراقبة بالاسم بيانات الاعتماد التي تستخدمها (`credential: iLO
  read-only`). لا تُصدَّر بيانات الاعتماد نفسها، ويجب أن تكون موجودة مسبقًا في النطاق الهدف.

## عبر API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

يتطلب رمز API بصلاحية **الإدارة** (راجع [المستخدمون والوصول](users-and-access.md)).

## الاستيراد من Uptime Kuma

تقرأ **التكوين › الاستيراد من Uptime Kuma** النسخة الاحتياطية بصيغة JSON من Uptime Kuma 1.x (*الإعدادات › النسخ الاحتياطي › تصدير*) أو ملف قاعدة البيانات `kuma.db` من الإصدارين 1.x و2.x (في مجلد بيانات Kuma). ترى معاينة أولًا، ولا يتغير شيء حتى تستورد.

تُستورد فحوص HTTP والكلمة المفتاحية وJSON البسيط ومنفذ TCP وping وDNS وpush بفواصلها ومحاولاتها ووسومها وحالة إيقافها المؤقت؛ وتصبح صلاحية شهادات HTTPS مراقبة شهادة منفصلة، وتصبح المجموعات تطبيقات. وتصبح الإشعارات قنوات بالإعدادات نفسها (يستخدم البريد منها خادم البريد المضبوط في الإعدادات) وتبدأ معطّلة ما لم تختر غير ذلك. لا تُمسّ العناصر التي يوجد اسمها بالفعل، لذا فإعادة الاستيراد آمنة. ويُعرض مع السبب كل ما لا يمكن استيراده بدقة (مثل مراقبات Docker أو قواعد البيانات، أو الوضع المعكوس).
