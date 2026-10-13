<!-- translation-of: discovery.md#cb4482b3 -->
# Descoberta

A **descoberta** encontra os dispositivos da sua infraestrutura e sugere um ativo e monitores
para cada um. Nada é criado até você escolher: você revisa o que foi encontrado, ajusta nomes e
monitores e cria os dispositivos que quiser no escopo que quiser.

A descoberta é feita no **escopo da infraestrutura global** (superadministradores e
administradores de infraestrutura). Quem faz a varredura é o worker, então ele precisa de acesso
de rede ao que você descobre; avise sua equipe de rede antes de varrer uma rede.

## Fontes

| Fonte | Encontra | Precisa de |
|---|---|---|
| **Varredura de sub-rede** | todo dispositivo que responde em uma rede: ping, algumas portas TCP (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP e, via HTTPS, Redfish (iLO, iDRAC) e a API do vSphere (ESXi, vCenter) | redes (`10.0.12.0/24`), faixas (`10.0.20.10-60`), endereços ou nomes de host, no máximo 4096 endereços; opcionalmente credenciais SNMP |
| **Inventário do vCenter** | o vCenter, seus hosts ESXi (marcados com `cluster:<nome>`) e VMs, com o endereço e o sistema operacional de cada VM vindos do VMware Tools; cada VM depende do seu host | o vCenter e uma conta somente leitura (credencial compartilhada) |
| **Vizinhos de switch (LLDP/CDP)** | quem está conectado a qual porta de switch; servidores, hosts ESXi e storage atrás de uma porta dependem daquele switch, os links entre switches são listados | os switches e credenciais SNMP |
| **HPE OneView** | frames Synergy, módulos de computação com seu endereço iLO, interconexões; cada um depende do seu frame | o appliance OneView e uma conta somente leitura |

As credenciais são credenciais compartilhadas do escopo global (**Credenciais**): comunidades SNMP
ou usuários SNMPv3 para a varredura de sub-rede e os vizinhos de switch, uma conta e senha para o
vCenter e o OneView. Somente o worker as lê.

## Como um dispositivo é reconhecido

A varredura de sub-rede reconhece um dispositivo pelo que responde: um serviço Redfish é uma
controladora de gerenciamento (iLO), a API do vSphere é ESXi ou vCenter, o SNMP informa o
fabricante (pelo número enterprise) e o tipo de dispositivo (pela descrição: switch, switch FC,
firewall, roteador, storage, Windows, Linux…), e as portas abertas ajudam quando nada mais ajuda
(RDP e SMB: Windows; SQL Server; SSH: Linux). O nome vem do SNMP, do DNS reverso ou do
certificado.

Cada tipo sugere um modelo de monitores (por exemplo *HPE iLO / BMC* ou *Host VMware ESXi*) e um
tipo de ativo. Altere por dispositivo: outro modelo, **Somente ping** ou **Somente ativo** (sem
monitores, por exemplo para um frame ou uma VM sem endereço).

## Revisar e criar

- A lista mostra de cada dispositivo o endereço, o nome (editável), com o que se parece
  (fabricante, modelo, detalhes como portas abertas, descrição SNMP, cluster, porta de switch) e
  os monitores sugeridos.
- Dispositivos **conhecidos** — existe em algum escopo um ativo com esse endereço (ou, sem
  endereço, com esse nome), ou há monitores verificando esse endereço — ficam ocultos; desmarque
  *Ocultar dispositivos conhecidos* para vê-los e saber onde estão.
- Marque dispositivos, escolha **Criar em** (o escopo global ou um locatário) e tags opcionais e
  depois **Visualizar**: a mesma visualização de uma importação de configuração, com cada ativo e
  monitor a criar. **Criar** aplica.
- As dependências vêm junto quando os dois dispositivos são criados juntos, ou quando aquele do
  qual se depende já existe nesse escopo (ou no escopo global).
- Uma descoberta em execução pode ser parada; as concluídas podem ser excluídas (o que foi criado
  permanece).
