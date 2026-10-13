<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# Kod olarak yapılandırma

**Yapılandırma**, geçerli kapsamı (varlıklar, monitörler, uygulamalar ve bağımlılıkları) YAML olarak
dışa aktarır ve yeniden içe aktarır. Git'te saklayın, bir kiracının yapılandırmasını diğerine
kopyalayın veya API üzerinden otomatikleştirin.

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

## İçe aktarma nasıl çalışır

- **Önce önizleme**: neyin oluşturulacağını veya değiştirileceğini alan alan listeler ve hataları
  satır numarasıyla bildirir. **Uygula** ya tamamen yapılır ya hiç yapılmaz.
- **Kısmi dosyalar güvenlidir**: dosyadaki bir öğe o öğeyi belirler; dosyada olmayan öğeler olduğu
  gibi kalır.
- **Dahil olmayanlar**: bildirim kanalları ve kimlik bilgileri (gizli bilgiler içerir) ile bakım
  pencereleri. İçe aktarılan push monitörleri yeni URL'ler alır. Uygulamalar kanallarını `notify`
  içinde adlarıyla belirtir; `notify` yoksa uygulama mevcut kanallarını korur.
- **Paylaşılan kimlik bilgileri**: bir monitör kullandığını adıyla belirtir (`credential: iLO
  read-only`). Kimlik bilgisinin kendisi dışa aktarılmaz ve hedef kapsamda zaten bulunmalıdır.

## API üzerinden

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

**Yönetme** iznine sahip bir API belirteci gerekir (bkz. [Kullanıcılar ve erişim](users-and-access.md)).

## Uptime Kuma'dan içe aktarma

**Yapılandırma › Uptime Kuma'dan içe aktar**, Uptime Kuma 1.x'in JSON yedeğini (*Ayarlar › Yedekleme › Dışa aktar*) veya 1.x ile 2.x'in `kuma.db` veritabanı dosyasını (Kuma'nın veri klasöründe) okur. Önce bir önizleme görürsünüz; içe aktarana kadar hiçbir şey değişmez.

HTTP, anahtar kelime ve basit JSON kontrolleri, TCP bağlantı noktası, ping, DNS ve push monitörleri aralıkları, yeniden denemeleri, etiketleri ve duraklatma durumlarıyla içe aktarılır; HTTPS sertifika süresi ayrı bir sertifika monitörüne, gruplar uygulamalara dönüşür. Bildirimler aynı ayarlara sahip kanallara dönüşür (e-posta olanlar Ayarlar'daki posta sunucusunu kullanır) ve aksini seçmedikçe kapalı başlar. Adı zaten var olan öğelere dokunulmaz, bu nedenle yeniden içe aktarmak güvenlidir. Aslına uygun aktarılamayan her şey (örneğin Docker veya veritabanı monitörleri ya da ters mod) nedeniyle listelenir.
