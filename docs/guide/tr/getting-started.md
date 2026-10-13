<!-- translation-of: getting-started.md#ea57bfb7 -->
# Başlarken

Fudo, iş uygulamalarınızın çalışıp çalışmadığını, çalışmıyorsa **nedenini** ve benzer sorunları daha
önce neyin çözdüğünü gösterir. Bu sayfa sizi yeni bir kurulumdan ilk bildiriminize götürür.

## 1. İlk oturum açma

Kurulumdan sonra (bkz. [Kurulum](../../admin/installation.md)) Fudo'yu tarayıcıda açın. **Kurulum
sihirbazı** şunları ister:

1. kuruluşunuzun adı,
2. ilk yönetici (ad, e-posta, en az 12 karakterlik parola),
3. iki adımlı doğrulama: QR kodunu bir doğrulama uygulamasıyla tarayın (Microsoft Authenticator,
   Google Authenticator, 1Password, …) ve **kurtarma kodlarını saklayın**,
4. isteğe bağlı olarak davetler, bildirimler ve raporlar için kullanılan e-posta sunucusu (SMTP). Bunu
   daha sonra **Ayarlar**'da da yapabilirsiniz.

İki adımlı doğrulama her hesap için zorunludur.

## 2. Bir kiracı oluşturun

**Kiracı** bir iş birimidir, örneğin *Finans* veya *İnsan Kaynakları*. Uygulamaları, monitörleri ve
bildirim kanalları diğer kiracılarınkinden ayrıdır. **Yönetim › Kiracılar › Yeni kiracı**'ya gidin,
ardından kiracıyı kenar çubuğunun üstündeki seçiciden seçin.

Paylaşılan altyapı (çekirdek anahtarlar, depolama sistemleri, kümeler) ise **Genel altyapı**
kapsamına aittir; bkz. [Kavramlar](concepts.md).

## 3. Bir monitör ekleyin

**Monitörler › Monitör ekle**, bir tür seçin (örneğin *HTTP(S)* veya *Ping*), hedefi girin ve kontrolü
kaydetmeden bir kez çalıştırmak için **Şimdi test et**'e tıklayın. Kaydedin; sonuçlar bir kontrol
aralığı içinde görünür. Çok sayıda ana bilgisayar için **Toplu ekleme / şablonlar**'ı kullanın; bkz.
[Monitörler](monitors.md).

## 4. Monitörleri bir uygulamada toplayın

**Uygulamalar › Yeni uygulama**, ardından hizmeti oluşturan monitörleri ekleyin (web ön yüzü, API,
veritabanı). Uygulamanın durumu hizmetin çalışıp çalışmadığını, çalışmıyorsa nedenini gösterir.
Raporlarda izlemek için bir **SLA hedefi** belirleyin.

## 5. Bildirim alın

**Bildirimler › Kanal ekle**: e-posta, Microsoft Teams, Slack, bir JSON webhook veya 100'den fazla
diğerinden biri (Telegram, PagerDuty, SMS ağ geçitleri, …). **Test gönder** kanalı denetler. Bkz.
[Bildirimler](notifications.md).

## 6. Ekip arkadaşlarınızı davet edin

**Yönetim › Kullanıcılar › Kullanıcı davet et**: her kiracı için dillerini ve rollerini seçin. Parola
belirleyip iki adımlı doğrulamayı ayarlamaları için tek kullanımlık bir bağlantı alırlar. Bkz.
[Kullanıcılar ve erişim](users-and-access.md).

## Sırada ne var

- [Kavramlar](concepts.md): kapsamlar, varlıklar, bağımlılıklar ve Fudo'nun kök nedeni nasıl bulduğu
- [Olaylar](incidents.md): bir şey arızalandığında ne olur
- [Sorun giderme](troubleshooting.md): sık sorulan sorular
