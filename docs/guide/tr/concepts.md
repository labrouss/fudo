<!-- translation-of: concepts.md#61c26734 -->
# Kavramlar

## Kapsamlar: kiracılar ve genel altyapı

| Kapsam | İçerir | Yöneten |
|---|---|---|
| **Kiracı** (her iş birimi için bir tane) | kendi uygulamaları, monitörleri, varlıkları, kanalları ve raporları | kiracı yöneticileri |
| **Genel altyapı** | paylaşılan varlıklar (anahtarlar, depolama sistemleri, FC ağları, kümeler) ve monitörleri | altyapı yöneticileri ve süper yöneticiler |

Kapsamı kenar çubuğunun üstündeki seçiciden seçin. Kiracılar paylaşılan altyapıyı salt okunur görür
ve kendi monitörlerini ve uygulamalarını ona bağlar; böylece bir depolama arızası, o depolamaya ihtiyaç
duyan her uygulamada neden olarak görünür.

## Yapı taşları

| Öğe | Nedir | Örnek |
|---|---|---|
| **Monitör** | düzenli aralıklarla çalışan bir kontrol | `erp.corp.local/health` üzerinde HTTPS |
| **Varlık** | monitörleri tarafından kontrol edilen bir altyapı parçası | `Core-SW-01`, `SAN-A` |
| **Uygulama** | bir iş hizmeti: monitörler (üyeler) ve ihtiyaç duyduğu altyapı | *ERP Production* |
| **Bağımlılık** | "bu, şuna ihtiyaç duyar": varlık → varlık, uygulama → varlık | ESXi kümesi → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

Bir varlıkta **Mevcut olanı ekle**, zaten sahip olduğunuz monitörleri ona bağlar (başka bir varlıktaki monitör taşınır), **Yeni monitör** ise o varlık için monitör formunu açar. Bir kiracı kendi monitörlerini paylaşılan bir genel varlığa da bağlayabilir; **Kaldır** monitörü varlıktan ayırır ve korur.

## Durumlar

| Durum | Anlamı |
|---|---|
| **Çalışıyor** | çalışıyor |
| **Bozulmuş** | çalışıyor ama yavaş veya kısmen (ör. isteğe bağlı bir üye çalışmıyor) |
| **Çalışmıyor** | arızalı ve bağlı olduğu hiçbir şey bunu açıklamıyor: bu bir **kök nedendir** |
| **Etkilenen** | bağlı olduğu bir şey çalışmadığı **için** arızalı; bildirimler kök nedeni gösterir |
| **Risk altında** | çalışıyor ama bağlı olduğu bir şeyde sorun var |
| **Bakım** | planlı bir bakım penceresinde: erişilebilirliği düşürmez |
| **Beklemede** | henüz sonuç yok |

## Fudo kök nedeni nasıl bulur

| Durum | Sonuç |
|---|---|
| Bir varlığın kontrolleri başarısız ama bağlı olduğu her şey çalışıyor | **Çalışmıyor**: kök neden, kendi olayıyla |
| Kontrolleri başarısız **ve** bağlı olduğu bir şey çalışmıyor | o kök nedenden **Etkilenen**: bildirim yağmuru yok |
| Kontrolleri başarılı ama bağlı olduğu bir şey çalışmıyor | durumunu korur, **Risk altında** olarak işaretlenir |
| Bağlı olduğu bir şey planlı bakımda | **Bakımdan etkilenen** (planlı, erişilebilirliğe dahil edilmez) |

Bir uygulama, kuralına göre üyeleri sağlıklıysa sağlıklıdır: **tüm zorunlu üyeler çalışıyor**, **en
az biri** veya **M üyeden en az N'si** (yedekli hizmetler için). Zorunlu üyeler durumu belirler;
isteğe bağlı olanlar onu yalnızca *Bozulmuş* yapabilir.

Bir varlıktaki **Bu arızalanırsa ne olur?**, onu çalışma için kapatmadan önce hangi uygulamaların
duracağını ve hangilerinin yedeklilik sayesinde ayakta kalacağını öngörür.

**Topoloji** sayfası tüm tabloyu canlı durumla çizer: bağımlılıklarını izlemek için bir öğenin üzerine
gelin; *Yalnızca sorunlar* neyin arızalı olduğunu ve neyin ona bağlı olduğunu gösterir.
