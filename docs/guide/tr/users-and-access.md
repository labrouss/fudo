<!-- translation-of: users-and-access.md#c2bf850f -->
# Kullanıcılar ve erişim

## Roller

| Rol | Nerede | Yapabilecekleri |
|---|---|---|
| **Süper yönetici** | her yerde | kullanıcılar, kiracılar ve ayarlar dahil her şey |
| **Altyapı yöneticisi** | Genel altyapı kapsamı (ve her kiracı) | paylaşılan altyapıyı ve tüm kiracıların verilerini yönetmek |
| **Kiracı yöneticisi** | tek bir kiracı | kiracıyı yönetmek: monitörler, varlıklar, uygulamalar, kanallar, raporlar, API belirteçleri |
| **Operatör** | tek bir kiracı | her şeyi görmek; monitörleri duraklatmak, sürdürmek ve test etmek, olayları onaylamak, sessize almak ve çözmek, not eklemek |
| **Görüntüleyici** | tek bir kiracı | her şeyi görmek, hiçbir şeyi değiştirmemek |

Bir kullanıcının her kiracıda farklı bir rolü olabilir. Kullanıcıları ve kiracıları süper
yöneticiler **Yönetim** altında yönetir.

## Davetler ve oturum açma

**Yönetim › Kullanıcılar › Kullanıcı davet et**: ad, e-posta, kullanıcının **dili** (davet e-postası
ve ilk oturum açma için) ve rolleri. Kullanıcı, parola belirlemek ve zorunlu olan **iki adımlı
doğrulamayı** ayarlamak için tek kullanımlık bir bağlantı (72 saat geçerli) alır. E-posta
ayarlanmamışsa bağlantıyı pencereden kopyalayıp kendiniz gönderin.

Telefonunuzu mu kaybettiniz? **Kurtarma kodlarından** biriyle oturum açın. Bir yönetici, kullanıcının
penceresinden **2FA'yı sıfırla** (parola kalır) veya **Parolayı ve 2FA'yı sıfırla** da yapabilir;
kullanıcı yeni bir bağlantı alır.

Hesaplar, 5 başarısız parola veya kod denemesinden sonra 15 dakika kilitlenir.

## Kullanıcıları devre dışı bırakma ve silme

**Devre dışı bırak**, oturum açmayı hemen engeller ve hesabı korur. **Kullanıcıyı sil**, hesabı
oturumları, rolleri ve 2FA'sıyla birlikte kaldırır; olaylar, notlar ve denetim günlüğü geçmişlerini
korur (*name@example (silindi)* olarak görünür). Kendinizi veya son etkin süper yöneticiyi
silemezsiniz.

## API belirteçleri

**API erişimi** (kiracı yöneticileri kendi kiracılarında, altyapı yöneticileri Genel altyapı
kapsamında) tek izinli belirteçler oluşturur:

| İzin | İzin verilenler |
|---|---|
| **Okuma** | monitörleri, olayları ve raporları görüntüleme |
| **İşletme** | ayrıca duraklatma/sürdürme, onaylama, notlar, testler |
| **Yönetme** | ayrıca oluşturma, değiştirme ve silme |

Bir belirteç yalnızca kendi kapsamında çalışır, süresi dolabilir, iptal edilebilir ve asla
kullanıcıları, kiracıları, ayarları veya diğer belirteçleri yönetemez. Yalnızca bir kez gösterilir;
yalnızca özeti (hash) saklanır.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

API belgeleri **/api/docs** adresinde yerleşiktir (çevrimdışı da çalışır); makinece okunabilir
belirtim `/api/openapi.json` adresindedir.

## Denetim günlüğü

**Yönetim › Denetim günlüğü**; oturum açmaları ve başarısız denemeleri, kilitlemeleri, davetleri ve
kullanıcılar, kiracılar ve ayarlardaki her değişikliği önceki ve sonraki değerleriyle kaydeder.

## Profiliniz

**Profil**'de (kenar çubuğunun altında) adınızı ve parolanızı değiştirir, iki adımlı doğrulamayı
yeni bir telefona taşır (yenisini onaylayana kadar eskisi çalışır), yeni kurtarma kodları alır ve
oturumlarınızı görüp diğerlerini kapatırsınız. Parolayı veya telefonu değiştirmek diğer
oturumlarınızı kapatır.

Sekmeleri: **Bilgileriniz**, **Parola**, **İki adımlı doğrulama**, **Oturumlar** ve **Nöbet** (nöbetleriniz, iletişim yöntemleriniz ve bildirim adımlarınız). Adres açık sekmeyi korur, örneğin `/profile#sessions`.

**İletişim yöntemleri**, Fudo'nun size kişisel olarak nasıl ulaştığıdır, örneğin nöbetteyken:
e-posta, sohbetinize yazan bir Microsoft Teams workflow'u ya da Telegram (bir yönetici *Ayarlar*'da
bir Telegram botu bağladığında). Her yöntem önce 6 haneli bir kodla onaylanır. **Bildirim
adımlarınız**, olay onaylanana kadar hangi yöntemlerin ne zaman kullanılacağını belirler; örneğin
hemen e-posta, 5 dakika sonra Telegram.

## Ekipler ve sahiplik

**Ekipler**, uygulamalardan ve altyapıdan sorumlu kişileri gruplar; örneğin bir kiracıda bir
*Veritabanı ekibi* veya Genel altyapı kapsamında bir *Depolama ekibi*. Herkes **üye** ya da
**lider**dir; yalnızca ekibin kapsamına erişimi olan kişiler eklenebilir.

Bir uygulamanın veya varlığın sayfasında **sahip ekibi** seçin. Böylece her olay sahibini ve
liderlerini gösterir; monitör olayları da (varlıkları veya uygulamaları üzerinden), olay sonrası
raporlar da. Bir kiracının öğeleri o kiracının ekiplerine, paylaşılan altyapı genel ekiplere aittir.
Nöbetler ekip başına belirlenir.
