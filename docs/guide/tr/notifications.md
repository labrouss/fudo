<!-- translation-of: notifications.md#5487cd95 -->
# Bildirimler

## Kanallar

**Bildirimler › Kanal ekle**. Yerleşik olanlar: **E-posta** (Ayarlar'daki SMTP sunucusunu gerektirir),
**Microsoft Teams** (Workflows webhook), **Slack** (incoming webhook) ve **Webhook (JSON)**. 100'den
fazla diğeri (Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover, Signal, Twilio ve diğer SMS ağ
geçitleri, Mattermost, Matrix, Google Chat, …) Uptime Kuma'nın bildirim sağlayıcılarından gelir.
**Test gönder** bir kanalı denetler; **Günlük** her gönderimi ve bir kanalın neden atlandığını gösterir.

Sohbet mesajları **[Fudo]** ile başlar; böylece aynı sohbete yazan başka araçlardan kolayca ayırt
edilirler.

## Bir kanal hangi olayları alır

| Ayar | Etkisi |
|---|---|
| **Gönder** | *Bu kiracının tüm olayları* (varsayılan) veya *Yalnızca seçili uygulamaların olayları* |
| **En düşük önem** | Küçük ve üstü (tümü), Büyük ve Kritik ya da yalnızca Kritik |
| **Olay türleri** | açılma, onaylanma, çözülme |
| **Başka bir olaydan kaynaklanan olayları atla** | yalnızca kök nedenler; onlara bağlı etkilenen olaylar değil |
| **Onaylanana kadar hatırlat** | kimse onaylamadığı sürece her N dakikada bir tekrarlar |
| **Mesajların dili** | kanalın dili; varsayılan: kuruluşun dili (Ayarlar) |

Bir kiracının kanalları, paylaşılan altyapının neden olduğu olaylar da dahil o kiracının olaylarını
alır (mesajda kök nedenle birlikte). Genel kanallar altyapı olaylarını alır; **tüm kiracılar**
seçeneğiyle (bir NOC kanalı) ayrıca her kiracının olaylarını alır, zaten aldıkları bir altyapı
olayından kaynaklananlar hariç.

**Uygulama bazında:** *Yalnızca seçili uygulamaların olayları* ayarlı bir kanal yalnızca bunlardan
haberdar olur. Bunları kanal formunda veya bir uygulamanın sayfasındaki **Bildirimler** kartında
seçin; bu kart, bir uygulamanın olayları hiçbir kanala ulaşmadığında da uyarır.

## Üst kademeye iletme

Bir kanala gecikme verin (**Üst kademeye ilet: 15 dk sonra onaylanmadıysa**); kanal bir üst kademe
adımı olur: yalnızca bu süreden sonra olay hâlâ açık, onaylanmamış ve sessize alınmamışsa bildirim
alır, ardından onaylanmasını ve çözülmesini de alır. Birkaçını zincirleyin: hemen Teams → 15 dakika
sonra nöbetçiye SMS → 60 dakika sonra yöneticiye.

## Teslim

Mesajlar yeniden denemeli (1, 5 ve 15 dakika sonra) ve kanal başına sınırlı bir giden kuyruğundan
geçer; böylece bir olay yağmuru botunuzun veya e-posta aktarıcınızın engellenmesine yol açmaz.

## Webhook içeriği

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

`X-Fudo-Signature: sha256=<gövdenin HMAC'i>` almak için bir **imza anahtarı** belirleyin. İçerik
İngilizce kalır (entegrasyonlar için sabit bir biçimdir); başlığı kendiniz çevirmek isterseniz
`incident.titleParts` onu mesaj kodları olarak içerir.

## Nöbetler

Ekipler, sahip oldukları öğelerin olayları için kişileri uyarır. **Ekipler › Nöbet**'te üyeleri çizelge
sırasına koyun, nöbet süresini (bir gün, bir hafta, iki hafta veya istenen gün sayısı), devir saatini ve
saat dilimini ve hangi olaylarda uyarılacağını seçin. **Üst kademeye iletme** adımları, olayın açıldığı
andan itibaren kimin ne zaman uyarılacağını belirler: örneğin nöbetçi hemen, sonraki kişi 15 dakika sonra,
liderler 30 dakika sonra. **Yerine geçmeler**, değişim veya izin gibi bir dönemi başkasının üstlenmesini
sağlar.

Her kişiye kendi bildirim adımlarıyla (bkz. *Profiliniz*), yoksa oturum açma adresine e-postayla ulaşılır.
Biri olayı onayladığı anda uyarılar durur, olay sessizdeyken de duraklar. Olay sayfası kimin uyarıldığını
ve ne gönderildiğini, profiliniz de sonraki nöbetlerinizi gösterir.

Nöbet mesajları **Onayla** ve **Fudo'da aç** bağlantılarını içerir (`PUBLIC_URL`'yi ayarlayın). Onayla, tek dokunuşla olayı oturum açmadan sizin adınıza onaylayan bir sayfa açar; bağlantıyı yalnızca açmak hiçbir şeyi değiştirmez, böylece bağlantı önizlemeleri ve e-posta tarayıcıları yanlışlıkla onaylayamaz. Her bağlantı bir kez, 24 saat boyunca, olay açıkken ve yalnızca rolünüz olayları onaylamaya izin veriyorsa çalışır.
