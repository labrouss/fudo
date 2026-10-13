<!-- translation-of: dashboards-and-reports.md#254ddd09 -->
# Panolar ve raporlar

## Genel bakış

Açık olaylar, ortalama kurtarma süresi (MTTR, 30 gün), çalışan ve arızalı monitörler, SLA hedefinde
olan uygulamalar ve her uygulama için 30 günlük erişilebilirlik şeridini gösteren bir kart. Sayfalar
canlı güncellenir (bir değişiklikten yaklaşık bir saniye sonra); bağlantı sürdükçe kenar çubuğunda
**Canlı** görünür.

**Erişilebilirlik** durum geçmişinden hesaplanır: çalışmayan ve etkilenen süre ondan düşülür; planlı
bakım ve ilk kontrolden önceki süre düşülmez.

## Grafikler

Her monitör; 1 sa, 6 sa, 24 sa, 7, 30 ve 90 gün için yanıt süresini (ortalama, p95, hatalar, bakım),
son kontrollerini nabız şeridi olarak, durum değişikliklerini ve son sonuçlarını gösterir.

## Raporlar

**Raporlar**, her uygulama için (ya da Genel altyapı kapsamındaki her paylaşılan varlık için) şunları
gösterir: 7/24 ve **mesai saatlerinde** erişilebilirlik, kesinti süresi, planlı bakım, olaylar,
karşılanan veya karşılanmayan SLA, MTTA (onaylama süresi) ve MTTR (çözme süresi). Geçen haftayı,
geçen ayı, son 30 günü veya kendi tarihlerinizi seçin ve şu biçimlerde indirin:

- **PDF**: sizin dilinizde; Arapça raporlar sağdan sola dizilir,
- **CSV**: erişilebilirlik ve olaylar, Excel için UTF-8, elektronik tablolar ve betikler çalışmaya
  devam etsin diye İngilizce sütun adlarıyla.

## Zamanlanmış raporlar

**Raporlar › Yeni zamanlama**, PDF ve/veya CSV'yi her pazartesi (önceki hafta) veya ayın 1'inde
(önceki ay), seçilen saatte ve saat diliminde, zamanlamanın dilinde, Ayarlar'daki SMTP sunucusu
üzerinden e-postayla gönderir. **Şimdi gönder** son dönemi hemen gönderir.

## Durum sayfaları

**Durum sayfaları › Yeni durum sayfası**, seçilen uygulamaları, varlıkları ve monitörleri
`/status/<adres>` adresindeki ayrı bir sayfada genel durum, 90 günlük erişilebilirlik, güncel olaylar
ve bakımlarla gösterir. Her öğe, iç adının yerine gösterilen bir **görünen ad** alır; aynı gruptaki
öğeler birlikte gösterilir. Kiracı sayfaları paylaşılan altyapıyı da içerebilir.

- **Herkese açık**: bağlantıya sahip herkes, oturum açmadan. Sayfa yalnızca görünen adları ve basit
  durumları (*Çalışıyor, Bozulmuş, Kesinti, Bakım*) gösterir; asla iç adları, nedenleri, olay
  başlıklarını veya bakım adlarını göstermez.
- **Dahili**: kiracıya erişimi olan, oturum açmış kullanıcılar; bunlar olay başlıklarını ve bakım
  adlarını da görür.

Sayfa her dakika yenilenir ve ziyaretçinin dilini ve açık ya da koyu modunu kullanır.
