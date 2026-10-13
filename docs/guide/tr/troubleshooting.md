<!-- translation-of: troubleshooting.md#0d0eae59 -->
# Sorun giderme

### Bildirim aldım ama olay listesi boş

- **Başka bir kiracı**: liste, kenar çubuğunda seçilen kapsamı gösterir. *Tüm kiracılar* ayarlı bir
  kanal her kiracının olaylarını alır; görmek için kiracıyı değiştirin.
- **Zaten çözüldü**: kısa kesintiler birkaç dakika içinde bir olay açıp kapatır; *Çözüldü* altına
  bakın.
- **Fudo'dan değil**: Fudo'nun sohbet mesajları **[Fudo]** ile başlar ve asla `EHOSTUNREACH` gibi ham
  hata kodları içermez. Başka bir izleme aracı (örneğin Uptime Kuma) hâlâ aynı sohbete yazıyorsa
  bildirim oradan gelmiştir. Kanalın **Günlük**'ü Fudo'nun gönderdiği her şeyi listeler.

### Bir monitör "Ana bilgisayara ulaşılamıyor" veya "zaman aşımı" ile başarısız oluyor

Kontrol, sizin bilgisayarınızdan değil Fudo'nun **worker** konteynerinden çalışır. Worker'ın ana
bilgisayarının hedefe ulaşabildiğinden emin olun (yönlendirme, güvenlik duvarları). Ping için
konteynerlerin `NET_RAW` yetkisine ihtiyacı vardır (`docker-compose.yml` içinde ayarlıdır).

### "SMTP sunucusunun sertifikasına güvenilmiyor"

E-posta aktarıcınız kendinden imzalı veya dahili bir sertifika kullanıyor. Ayarlar › E-posta (SMTP)
altında **Kendinden imzalı sertifikaları kabul et**'i açın.

### Bir anahtarın arkasındaki her şey aynı anda kırmızıya döndü

Bu beklenen bir durumdur ve Fudo bunu yönetir: anahtar **Çalışmıyor** (kök neden), arkasındakiler
**Etkilenen** durumdadır. Diğerleri ona bağlı tek bir kök olay alırsınız. Fudo'nun bunu bilmesi için
bağımlılıkların tanımlı olduğundan emin olun (varlık anahtara *bağlıdır*).

### Planlı bir değişiklik nöbetçiyi alarma geçirdi

Önce ilgili varlıklar için bir [bakım penceresi](maintenance.md) oluşturun: kontroller sürer, ancak
bildirimler bastırılır ve süre erişilebilirliği düşürmez.

### Bir uygulamanın olayları kimseye ulaşmıyor

Uygulamayı açın: **Bildirimler** kartı, hiçbir kanal olaylarını almadığında uyarır (örneğin tüm
kanallar o uygulama olmadan *Yalnızca seçili uygulamaların olayları* olarak ayarlıysa).

### Sayfada "Canlı güncellemelere yeniden bağlanılıyor" yazıyor

Tarayıcı API ile bağlantısını kaybetti; bağlantı geri geldiğinde sayfalar kendiliğinden yeniden
güncellenir. Devam ederse, Fudo'nun önündeki bir proxy'nin `/api/live` adresine uzun süreli
bağlantılara (Server-Sent Events) izin verdiğini denetleyin.

### Telefonumu kaybettim

Bir kurtarma koduyla oturum açın veya bir yöneticiden hesabınız için **2FA'yı sıfırla**masını isteyin.
