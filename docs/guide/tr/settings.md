<!-- translation-of: settings.md#401e7e53 -->
# Ayarlar

**Ayarlar** (kenar çubuğunun altında), herkes için kişisel tercihlerinizi ve süper yöneticiler için
sistem ayarlarını içerir.

Her bölüm bir sekmedir. Adres açık sekmeyi korur (örneğin `/settings#retention`), böylece bir sekme yer imlerine eklenebilir veya bağlantı olarak gönderilebilir.

## Tercihleriniz

- **Arayüz dili**: sağdan sola düzenli Arapça dahil 13 dil. Profilinize kaydedilir, böylece her
  tarayıcıda sizinle gelir. Olay başlıkları ve kontrol sonuçları da çevrilir.
- **Tema**: **Sistem** (işletim sisteminizin açık veya koyu modunu izler), **Açık**, **Koyu**,
  **Monokai** ve yöneticinizin eklediği temalar.

## Sistem ayarları (süper yöneticiler)

### Bildirim dili

Bildirimlerin ve zamanlanmış raporların **varsayılan dili**. Her kanal ve her zamanlama kendi dilini
kullanabilir; bir kişiye giden e-postalar (davetler, sıfırlamalar) o kişinin dilindedir. Arayüzü
değiştirmez: onu herkes *Tercihler*'de kendisi seçer.

### E-posta (SMTP)

Davetler, e-posta bildirimleri ve zamanlanmış raporlar için kullanılır.

| Alan | Notlar |
|---|---|
| SMTP sunucusu, bağlantı noktası | 587 (STARTTLS) veya 465 (*Baştan TLS kullan*); dahili aktarıcı için 25 |
| Kullanıcı adı, parola | isteğe bağlı; parola şifrelenmiş olarak saklanır ve bir daha gösterilmez |
| Gönderen adresi | ör. `fudo@corp.local` |
| **Kendinden imzalı sertifikaları kabul et** | kendinden imzalı veya dahili sertifikalı yerel bir aktarıcı için: bağlantı şifreli kalır, yalnızca sertifika denetimi atlanır |

**Test e-postası gönder**, bir sorun olduğunda kesin nedeni gösterir: güvenilmeyen bir sertifika,
yanlış parola, ulaşılamayan bir sunucu veya bağlantı noktasıyla uyuşmayan bir TLS modu.

## Yöneticiler için

Yeni diller ve temalar, yeniden derlemeden klasörlere dosya koyarak eklenir; depodaki
`locales/README.md` ve `themes/README.md` dosyalarına bakın.

## Veri saklama

**Ayarlar › Veri saklama** (süper yöneticiler), her veri türünün ne kadar saklanacağını belirler ve kapladığı alanı gösterir: ham kontrol sonuçları, saatlik ve günlük özetler, durum geçmişi, çözülmüş olaylar, bildirim günlüğü, denetim günlüğü ve tamamlanmış bakım pencereleri. Eski veriler her saat azar azar kaldırılır. En düşük değerler Fudo'nun gösterdiklerini korur (90 günlük grafikler, erişilebilirlik raporları, durum sayfaları); sınırdan önceki son durum değişikliği her zaman saklanır, böylece erişilebilirlik doğru kalır. Açık olaylar ve gönderilmeyi bekleyen bildirimler asla kaldırılmaz.
