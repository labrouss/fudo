<!-- translation-of: maintenance.md#f097f823 -->
# Bakım pencereleri

Çalışmaları kimseyi alarma geçirmeyecek ve erişilebilirliği düşürmeyecek şekilde planlayın.

**Bakım › Bakım planla**: bir başlık, başlangıç ve bitiş, notlar (değişiklik talebi, iletişim kişisi,
geri dönüş planı) ve neyi **kapsadığını** girin: varlıklar (kontrolleriyle birlikte) ve monitörler.

Pencere süresince:

- kontroller çalışmaya devam eder, böylece neler olduğunu görürsünüz,
- sonuçları **erişilebilirlikten** ve SLA'dan **hariç tutulur**,
- **bildirimler bastırılır**,
- bakımdaki bir şeye bağlı öğeler bunu neden olarak gösterir (*Bakımdan etkilenen*); böylece kimse
  planlı bir kesintinin peşine düşmez.

**Şimdi bitir** bir pencereyi erken kapatır. Pencereler *Planlandı*, *Sürüyor* veya *Tamamlandı*
olarak görünür.

İpucu: çalışmanın hangi uygulamaları etkileyeceğini görmek için önce varlıkta **Bu arızalanırsa ne
olur?**'u kullanın.

## Yinelenen bakım

Planlarken **Yinele**'yi seçin: her gün, seçilen günlerde her hafta ya da her ay; ayın bir gününde
(31. gün, daha kısa aylarda ayın son gününe denk gelir) veya bir haftanın bir gününde (*ikinci haftanın
salısı* Microsoft'un Patch Tuesday'idir). Saatler seçilen saat dilimindedir; bu yüzden 02:00, saat
değişikliğinden sonra da 02:00 kalır; başlangıçtan önceki bir bitiş saati ertesi günü ifade eder.

Fudo önümüzdeki 60 günün pencerelerini **Yinelenir** işaretiyle oluşturur. **Atla** bir tekrarı
kaldırır, bir pencereyi düzenlemek yalnızca o tekrarı değiştirir. Seriyi düzenlemek gelecekteki
pencerelerini değiştirir; silmek onları kaldırır, geçmiş ve süren pencereler kalır.
