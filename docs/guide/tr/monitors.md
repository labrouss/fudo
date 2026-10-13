<!-- translation-of: monitors.md#eb8b19a2 -->
# Monitörler

## Liste

Monitör listesi her monitörün **varlığını** ve ait olduğu **uygulamaları** gösterir (isteğe bağlı üyelik kesikli çerçevelidir); ikisi de bağlantıdır. Sıralamak için bir sütun başlığına tıklayın (ters sıra için tekrar, varsayılan sıra için üçüncü kez); Fudo sıralamayı bu tarayıcıda hatırlar. Filtre kutusu adlarda, hedeflerde, etiketlerde, varlıklarda ve uygulamalarda arar; büyük/küçük harfi ve aksanları yok sayar, her kelime eşleşmelidir. Diğer uzun listeler (varlıklar, olaylar, kullanıcılar, bakımlar, kanallar ve diğerleri) aynı şekilde sıralanır ve filtrelenir.

## Monitör türleri

| Kategori | Tür | Kontrol eder |
|---|---|---|
| Web | **HTTP(S)** | durum kodu aralıkları, anahtar kelime var/yok, JSON değeri (`$.status`), üst bilgiler, gövde, yanıt süresi |
| | **TLS sertifikası** | güven, ana bilgisayar adı, süre bitimine kalan gün (N gün içinde Bozulmuş, süresi dolunca Çalışmıyor) |
| Ağ | **Ping** | erişilebilirlik, gecikme, paket kaybı |
| | **TCP bağlantı noktası** | bağlantı noktası bağlantı kabul ediyor |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, isteğe bağlı beklenen yanıt, seçilen çözümleyici |
| | **SNMP** | bir OID okur (v1, v2c, v3) ve değeri ya da sayaçlarda saniye başına değişimini karşılaştırır |
| | **Ağ arayüzü (SNMP)** | bir anahtar, yönlendirici veya güvenlik duvarı portu: bağlantı durumu, gelen ve giden trafik (bit/s ve bağlantı hızının %'si), hatalar; zaman içinde grafikle |
| | **NTP** | erişilebilirlik, stratum, saat sapması |
| | **SMTP** | 220 karşılaması, EHLO, isteğe bağlı STARTTLS |
| | **LDAP / Active Directory** | dizin yanıt veriyor (Active Directory: etki alanı denetleyicisi eşitlenmediği sürece bozulmuş) ya da bir hesap oturum açıyor ve arama kayıt buluyor; kilitli, süresi dolmuş ve devre dışı hesapları belirtir |
| | **Alan adı süresi** | RDAP ile kayıt bitiş tarihi (yedek olarak WHOIS) |
| Veritabanları | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | bağlanır, isteğe bağlı olarak beklenen sonuçla sorgu çalıştırır |
| Sistemler | **SSH komutu** | çıkış kodu veya çıktı (içerir, birebir, regex), isteğe bağlı ana bilgisayar anahtarı sabitleme |
| | **Docker konteyneri** | çalışıyor ve sağlık kontrolü varsa sağlıklı |
| Altyapı | **vCenter VM** | güç durumu, VMware Tools (vCenter 6.7, 7, 8) |
| | **HPE iLO / Redfish sağlığı** | BMC'den sunucu donanım sağlığı (iLO 4/5/6, iDRAC, diğer Redfish BMC'leri) |
| | **Giriş sıcaklığı (iLO / Redfish)** | sunucuya giren havanın, yani kabinin önündeki sıcaklık: 27 °C'den bozulmuş, 32 °C'den kesinti (ASHRAE), grafikli |
| | **Oda sıcaklığı** | `room:<name>` etiketli tüm giriş sensörleri birlikte: birkaçı sıcakken kesinti (soğutma sorunu), biri sıcakken veya birkaçı hızla yükselirken bozulmuş |
| Pasif | **Push heartbeat** | bir görev bir URL'yi çağırır; çağırmayı bırakınca Çalışmıyor |
| | **SNMP trapleri** | bir cihazın gönderdiği trapler (v1, v2c): açık bir sorun trapi oldukça çalışmıyor veya bozulmuş; kendiliğinden, bir kapatma trapiyle veya elle kapanır |

**Şimdi test et**, bildirim göndermeye başlamadan önce ayarlayabilmeniz için bir kontrolü Fudo
sunucusundan kaydetmeden bir kez çalıştırır.

## Yanlış alarmlardan kaçınma

- **N hatadan sonra Çalışmıyor**: bir monitör ancak art arda N başarısız kontrolden sonra Çalışmıyor
  olur; arada daha sık olan *yeniden deneme aralığında* kontrol eder.
- **M başarıdan sonra Çalışıyor**: ancak art arda M başarılı kontrolden sonra düzelir.
- **Şunun üzerinde Bozulmuş**: yavaş yanıtlar Çalışmıyor yerine Bozulmuş sayılır.

## Kimlik bilgileri

Parolalar, SNMP topluluk adları, SSH anahtarları ve benzerleri **şifrelenmiş** olarak saklanır; bir
daha gösterilmez, dışa aktarılmaz ve API tarafından döndürülmez. Bir kontrolü çalıştırmak için onları
yalnızca worker çözer. Salt okunur hesaplar kullanın: *Read-only* vCenter rolü, *Login* yetkisine
sahip bir iLO kullanıcısı, yalnızca `CONNECT`/`SELECT` yetkili bir veritabanı kullanıcısı.

### Paylaşılan kimlik bilgileri

Birçok monitör aynı hesapla oturum açıyorsa (tüm sunucular için salt okunur bir iLO kullanıcısı,
anahtarlar için bir SNMP topluluğu), onu **Kimlik bilgileri** altında bir kez saklayın ve
monitörlerin kullanmasına izin verin. Parola değiştiğinde kimlik bilgisini bir kez düzenleyin: onu
kullanan her monitör yeni değerle hemen yeniden kontrol eder.

- Bir kimlik bilgisinin türü vardır: *Hesap ve parola*, *SSH anahtarı*, *SNMP topluluğu (v1,
  v2c)* veya *SNMPv3 kullanıcısı*. Monitör formunda oturum açan türler **Burada girin** veya
  **Paylaşılan kimlik bilgisi kullan** seçeneğini sunar; kimlik bilgisiyle hesap alanları formdan
  kaybolur.
- Kimlik bilgileri bir kapsama aittir: bir kiracının monitörleri yalnızca o kiracının kimlik
  bilgilerini, genel altyapı kapsamının monitörleri yalnızca genel olanları kullanabilir.
- Gizli bilgiler, bir monitörünkiler gibi yalnızca yazılabilir: şifreli saklanır, asla
  gösterilmez, dışa aktarılmaz veya döndürülmez. Liste hesabı ve onu hangi monitörlerin
  kullandığını gösterir.
- **Birden çok monitörde aynı hesap**: sayfa, aynı hesabı ve parolayı zaten saklayan monitörleri
  listeler. Gruba bir ad verip **Paylaşılan kimlik bilgisi yap** seçeneğini seçin: parola sunucuda
  kopyalanır, kimsenin onu bilmesi gerekmez.
- **Şunlar için kullan…** daha fazla monitörü bir kimlik bilgisine bağlar; kendi hesapları ve
  parolaları kaldırılır. Kullanımdaki bir kimlik bilgisi silinemez ve türü değiştirilemez.
- Kimlik bilgisi kullanmayı bırakan bir monitörün yeniden kendi parolası olmalıdır.
- [Kod olarak yapılandırmada](configuration-as-code.md) bir monitör kimlik bilgisini adıyla
  belirtir (`credential: iLO read-only`); kimlik bilgisinin kendisi arayüzde oluşturulur. Sıcaklık
  kontrollerini toplu ekleme de bunu kullanabilir.
- Her değişiklik denetim günlüğüne, değişen gizli bilgilerin adlarıyla birlikte kaydedilir; asla
  değerleriyle değil.

## Push monitörleri

Bir push monitörü, görevinizin onu çağırmasını bekler. Kaydettikten sonra sayfası URL'yi gösterir:

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

Aralık artı tolerans süresi içinde çağrı gelmezse Çalışmıyor olur. Belirteç sızdıysa **Yeni URL**
onu değiştirir.

## Toplu ekleme ve şablonlar

**Monitörler › Toplu ekleme / şablonlar** çok sayıda ana bilgisayar için aynı anda kontrol oluşturur:

1. her satıra bir ana bilgisayar veya URL yapıştırın (ya da `name,host,port` içeren bir CSV
   yükleyin),
2. bir **şablon** seçin, örneğin *Windows sunucusu* (ping, RDP, WinRM), *Linux sunucusu*, *HPE iLO*,
   *ağ cihazı*, *ESXi ana bilgisayarı*, *vCenter*, *SQL Server*, *depolama sistemi* veya *web
   uygulaması*, ya da tek bir kontrol türü,
3. isteğe bağlı olarak her satır için bir varlık oluşturun, bunları mevcut bir varlığa bağlayın ve bir
   uygulamaya ekleyin.

Uygulamadan önce oluşturulacak her şeyin önizlemesini gösterir.

## Türlere göre notlar

- **vCenter VM** doğru API sürümünü kendisi bulur ve oturumları yeniden kullanır (her vCenter için 20
  dakikada bir oturum açma). VMware Tools kontrolü vCenter 7.0 veya üstünü gerektirir.
- **HPE iLO / Redfish**, HPE iLO'da arızalı parçayı adıyla belirtir (fanlar, güç kaynakları, depolama,
  yedeklilik). Warning → Bozulmuş, Critical veya kapalı → Çalışmıyor.
- **SSH komutu**: değişen bir sunucu anahtarının kabul edilmek yerine bildirilmesi için *Ana bilgisayar
  anahtarı parmak izi*ni ayarlayın (`ssh-keyscan host | ssh-keygen -lf -`).
- **Docker konteyneri** yerel Docker soketini (worker konteynerine bağlayın, bkz.
  `docker-compose.yml`) veya uzak bir Docker API URL'sini kullanır.
- **Alan adı süresi**: bazı ulusal kayıt kuruluşları ne RDAP ne de WHOIS yayınlar; Fudo bunu bir
  açıklamayla Bozulmuş olarak bildirir.
- **Ping**, worker konteynerinde ve **Şimdi test et** için API konteynerinde `NET_RAW` yetkisine
  ihtiyaç duyar (ikisi de `docker-compose.yml` içinde ayarlıdır).

## SNMP trapleri

Cihazlarınızın SNMP traplerini (v1 veya v2c) Fudo sunucusuna, UDP 162 portuna yönlendirin.
**Trapler** sayfası trap alınıp alınmadığını ve her trapi alanlarıyla gösterir.

- **SNMP trapleri** monitörü **Gönderen** alanındaki cihazların traplerini alır: adresler, ana
  bilgisayar adları veya IPv4 aralıkları (`10.0.12.0/24`). Bir **Topluluk** (veya SNMP topluluğu
  türünde paylaşılan bir kimlik bilgisi) verilirse yalnızca onu taşıyan trapleri alır; topluluk
  asla saklanmaz.
- **Sorun trapleri**: standart olanlar (link down, soğuk ve sıcak başlatma, kimlik doğrulama
  hatası), yalnızca listelenen trapler (adlar veya OID'ler; bir OID altındaki her şeyi de kapsar,
  ör. bir üreticinin enterprise öneki) ya da her trap. *Yalnızca bir alan şunu içeriyorsa*,
  `Critical` gibi bir metin içeren traplerle sınırlar.
- Bir sorun açıkken monitör **Çalışmıyor** durumundadır (ya da seçerseniz Bozulmuş); olay,
  bildirimler ve nöbet her kontrolde olduğu gibi, trapten bir saniye içinde çalışır.
- Sorunlar trap ve arayüz başına tutulur: iki portta link down iki sorundur ve bir portun **link
  up** trapi yalnızca o portun sorununu kapatır.
- **Sorunlar kapanır**: bir süre yeni trap gelmezse otomatik olarak (varsayılan 30 dakika) ya da
  yalnızca elle: monitör sayfası açık trapleri **Temizle** düğmesiyle listeler (eşleşen bir
  sonraki trape kadar). *Kapatma trapleri* de sorunları kapatır, ör. bir üreticinin “durum
  giderildi” trapi.
- **Hiçbir monitörün almadığı** bir trap yine de saklanır: o adrese sahip varlığın kiracısında,
  yoksa genel altyapı kapsamında. Trapler sayfasındaki **Monitör oluştur**, cihazı için bir
  monitörü doldurur.
- Trap yağdıran bir cihaz sınırlanır (saniyede 50, 500'e kadar ani artış); atılan trapler genel
  kapsamın Trapler sayfasında sayılır. Trapler 30 gün saklanır (Ayarlar › Veri saklama).

## Ağ arayüzleri

**Ağ arayüzü (SNMP)** monitörü bir anahtarın, yönlendiricinin veya güvenlik duvarının bir portunu
izler.

- **Arayüzleri bul…** (ana bilgisayar ve SNMP erişimi ya da paylaşılan kimlik bilgisinden sonra)
  cihazın arayüzlerini açıklama, hız ve durumla listeler. Birini seçin ya da eklerken birkaçını
  işaretleyin: her biri formun ayarlarıyla, arayüzün adını taşıyan bir monitör olur.
- Arayüz numarasıyla değil **adıyla** (veya açıklaması ya da takma adıyla) tutulur, çünkü bazı
  cihazlar yeniden başlatmadan sonra arayüzlerini yeniden numaralandırır. Numara da çalışır.
- **Trafik**, 64 bit sayaçların iki okuması arasındaki farktır: ilk kontrol iki saniye arayla iki
  kez okur; sonraki kontroller önceki kontrolden saklanan okumayı kullanır. Cihaz yeniden
  başlatıldıktan sonra o çift atlanır, böylece sahte bir sıçrama olmaz. 64 bit sayacı olmayan
  cihazlar (SNMP v1) 32 bit sayaçları kullanır; bunlar bir dakikalık aralıkla yaklaşık
  100 Mbit/s üzerinde güvenilir değildir.
- **Durum**: bağlantı kopuk → Çalışmıyor; testing veya dormant → Bozulmuş; bilerek devre dışı
  bırakılmış bir port Çalışıyor'dur (ya da seçerseniz Çalışmıyor). Daha yoğun yön *Şu kullanımdan
  itibaren bozulmuş* (varsayılan %80) üzerindeyse → Bozulmuş, *Şu kullanımdan itibaren çalışmıyor*
  (varsayılan olarak kapalı) üzerindeyse → Çalışmıyor; dakika başına sınırın üzerindeki hatalar →
  Bozulmuş. Cihaz yanlış hız bildiriyorsa (bir tünel, hız sınırlı bir hat) *Bağlantı hızı*nı
  girin.
- Monitör sayfası gelen ve giden trafiği Bozulmuş çizgisiyle gösterir.
- **SNMP** monitöründeki *Karşılaştır: saniye başına değişimi* aynısını herhangi bir sayaç için
  yapar (SAN portundaki çerçeveler, güvenlik duvarı oturumları, UPS olayları).

## Veri merkezi sıcaklığı

**Sıcaklık**, her giriş sıcaklığı sensörünü `room:<name>` etiketine göre gruplanmış ve en sıcaktan başlayarak sıralanmış olarak; kabini (`rack:<name>`), güncel değeri, son 6 saati, 15 dakikalık değişimi ve 24 saatlik aralığıyla gösterir. **Sensör ekle**, bir iLO (veya diğer Redfish BMC) adres listesi için ortak, salt okunur bir hesapla bunları oluşturur.

Bir sensör, sıcaklığı eşiklerin altında olsa bile **hızla yükseldiğinde** (varsayılan olarak 15 dakikada 3 °C) de bozulmuş olur: soğutma arızasının en erken işareti. **Oda uyarısı oluştur**, oda için bir *Oda sıcaklığı* monitörü ekler: 3 sensör sıcakken kesinti, biri sıcakken veya 2'si hızla yükselirken bozulmuş. Her monitör gibi olay açar; bu yüzden sahiplik, nöbetler ve durum sayfaları onun için de çalışır.
