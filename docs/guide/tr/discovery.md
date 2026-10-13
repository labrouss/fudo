<!-- translation-of: discovery.md#cb4482b3 -->
# Keşif

**Keşif**, altyapınızdaki cihazları bulur ve her biri için bir varlık ve monitörler önerir. Siz
seçene kadar hiçbir şey oluşturulmaz: bulunanları inceler, adları ve monitörleri düzenler, istediğiniz
cihazları istediğiniz kapsamda oluşturursunuz.

Keşif **genel altyapı kapsamında** çalışır (süper yöneticiler ve altyapı yöneticileri). Taramayı
worker yapar, bu yüzden keşfettiğiniz şeylere ağ erişimi olmalıdır; bir ağı taramadan önce ağ
ekibinizi bilgilendirin.

## Kaynaklar

| Kaynak | Bulduğu | Gerektirdiği |
|---|---|---|
| **Alt ağ taraması** | bir ağda yanıt veren her cihaz: ping, birkaç TCP portu (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP ve HTTPS üzerinden Redfish (iLO, iDRAC) ile vSphere API (ESXi, vCenter) | ağlar (`10.0.12.0/24`), aralıklar (`10.0.20.10-60`), adresler veya ana bilgisayar adları, en fazla 4096 adres; isteğe bağlı SNMP kimlik bilgileri |
| **vCenter envanteri** | vCenter, ESXi ana bilgisayarları (`cluster:<ad>` etiketli) ve sanal makineleri; her sanal makinenin adresi ve işletim sistemi VMware Tools'tan gelir; her sanal makine kendi ana bilgisayarına bağımlıdır | vCenter ve salt okunur bir hesap (paylaşılan kimlik bilgisi) |
| **Anahtar komşuları (LLDP/CDP)** | hangi anahtar portuna kimin bağlı olduğu; bir portun arkasındaki sunucular, ESXi ana bilgisayarları ve depolama o anahtara bağımlıdır, anahtarlar arası bağlantılar listelenir | anahtarlar ve SNMP kimlik bilgileri |
| **HPE OneView** | Synergy çerçeveleri, iLO adresleriyle işlem modülleri, ara bağlantılar; her biri kendi çerçevesine bağımlıdır | OneView cihazı ve salt okunur bir hesap |

Kimlik bilgileri genel kapsamın paylaşılan kimlik bilgileridir (**Kimlik bilgileri**): alt ağ
taraması ve anahtar komşuları için SNMP toplulukları veya SNMPv3 kullanıcıları, vCenter ve
OneView için hesap ve parola. Bunları yalnızca worker okur.

## Bir cihaz nasıl tanınır

Alt ağ taraması bir cihazı neyin yanıt verdiğine göre tanır: Redfish hizmeti bir yönetim
denetleyicisidir (iLO), vSphere API ESXi veya vCenter'dır, SNMP üreticiyi (kuruluş numarasından)
ve cihaz türünü (açıklamasından: anahtar, FC anahtarı, güvenlik duvarı, yönlendirici, depolama
dizisi, Windows, Linux…) söyler; başka hiçbir şey yardımcı olmadığında açık portlar yardımcı olur
(RDP ve SMB: Windows; SQL Server; SSH: Linux). Ad SNMP'den, ters DNS'ten veya sertifikadan gelir.

Her tür bir monitör şablonu (örneğin *HPE iLO / BMC* veya *VMware ESXi ana bilgisayarı*) ve bir
varlık türü önerir. Bunu cihaz başına değiştirin: başka bir şablon, **Yalnızca ping** veya
**Yalnızca varlık** (monitör yok; ör. bir çerçeve veya adresi olmayan bir sanal makine için).

## İnceleme ve oluşturma

- Liste her cihazın adresini, adını (düzenlenebilir), neye benzediğini (üretici, model, açık
  portlar, SNMP açıklaması, küme, anahtar portu gibi ayrıntılar) ve önerilen monitörleri gösterir.
- **Bilinen** cihazlar — herhangi bir kapsamda bu adrese (veya adres yoksa bu ada) sahip bir varlık
  vardır ya da bu adresi denetleyen monitörler vardır — gizlenir; onları ve nerede olduklarını
  görmek için *Bilinen cihazları gizle* işaretini kaldırın.
- Cihazları işaretleyin, **Oluşturulacak yer** (genel kapsam veya bir kiracı) ve isteğe bağlı
  etiketleri seçin, ardından **Önizleme**: oluşturulacak her varlık ve monitörle, yapılandırma
  içe aktarmasıyla aynı önizleme. **Oluştur** bunu uygular.
- Bağımlılıklar, iki cihaz birlikte oluşturulduğunda veya bağımlı olunan cihaz o kapsamda (ya da
  genel kapsamda) zaten varsa korunur.
- Çalışan bir keşif durdurulabilir; bitenler silinebilir (oluşturulanlar kalır).
