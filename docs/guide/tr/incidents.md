<!-- translation-of: incidents.md#4e781264 -->
# Olaylar

Fudo, bir şey arızalandığında olayları kendisi açar ve düzeldiğinde çözer.

## Olay ne zaman açılır

| Öğe | Şu durumda olay açar | Önem |
|---|---|---|
| **Uygulama** | Çalışmıyor ya da planlanmamış bir nedenden Etkilenen | kritikliğine göre: kritik → Kritik, yüksek → Büyük, diğerleri → Küçük |
| **Varlık** | Çalışmıyor (kök nedendir) | Büyük |
| **Monitör** | Çalışmıyor ve bir varlığın veya uygulamanın parçası değil | Küçük |

**Etkilenen** bir olay, kök nedeninin olayına bağlanır (*INC-… tarafından neden olundu*): arızalı bir
anahtar, bildirim yağmuru yerine açıkça bağlı etkilenen olaylarla tek bir kök olay oluşturur.

## Bir olayın yaşam döngüsü

1. Otomatik olarak **açılır** ve bildirimler gönderilir (bkz. [Bildirimler](notifications.md)).
2. **Onayla**, birinin ilgilendiğini gösterir; hatırlatmalar ve üst kademeye iletmeler durur.
3. **Sessize al**, onaylamadan bildirimleri bir süre susturur (30 dakika ile 1 gün arası).
4. Öğe düzeldiğinde otomatik olarak **çözülür**. 5 dakika içinde yeniden arızalanırsa yeni bir olay
   yerine aynı olay **yeniden açılır**. Olayı elle de çözebilirsiniz.

**Zaman çizelgesi** her adımı kaydeder: durum değişiklikleri, bildirimler, onaylar ve notlar.

## Notlar: öğrendiklerinizi paylaşın

Zaman çizelgesine **Yorum**, **Yapılan işlem** veya **Çözüm** olarak etiketlerle (ör. `supervisor`,
`firmware`) not ekleyin.

Çözümler yeniden kullanılır: daha sonra benzer bir olay yaşandığında (aynı öğe, aynı kök neden, ortak
etiketler veya benzer metin), **Benzer geçmiş olaylar** neyin işe yaradığını gösterir ve bildirimleri
bunu alıntılar: *"Geçen sefer (INC-0041, 12 Ağu 2026) şöyle çözüldü: …"*.

## Olayları bulma

**Olaylar**, kenar çubuğunda seçilen kapsamın **açık** olaylarını listeler; geçmiş için *Çözüldü*'ye
geçin ve başlık, INC numarası veya etiketle arayın. Başka bir kiracının olayları, o kiracıya
geçtiğinizde görünür (bkz. [Sorun giderme](troubleshooting.md)).

## Olay sonrası raporlar

Bir olaydaki **Olay sonrası rapor**, raporu **PDF** veya **Markdown** (bir wiki ya da kayıt için) olarak indirir: saatler ile kimin onayladığını ve çözdüğünü gösteren bir özet, etkilenen olaylar, çözüm ve yapılan işlemler, zaman çizelgesi, gönderilen bildirimler ve benzer geçmiş olaylar. Dilinizi ve saat diliminizi kullanır; olay hâlâ açıkken de oluşturulabilir.
