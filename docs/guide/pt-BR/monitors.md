<!-- translation-of: monitors.md#eb8b19a2 -->
# Monitores

## A lista

A lista de monitores mostra o **ativo** de cada monitor e as **aplicações** às quais ele pertence (uma participação opcional tem contorno tracejado); ambos são links. Clique no cabeçalho de uma coluna para ordenar (de novo para inverter, uma terceira vez para a ordem padrão); o Fudo lembra a ordenação neste navegador. O filtro pesquisa nomes, destinos, tags, ativos e aplicações; ignora maiúsculas e acentos, e todas as palavras precisam corresponder. As outras listas longas (ativos, incidentes, usuários, manutenções, canais e outras) são ordenadas e filtradas da mesma forma.

## Tipos de monitor

| Categoria | Tipo | Verifica |
|---|---|---|
| Web | **HTTP(S)** | faixas de códigos de status, palavra-chave presente/ausente, valor JSON (`$.status`), cabeçalhos, corpo, tempo de resposta |
| | **Certificado TLS** | confiança, nome do host, dias até o vencimento (Degradado dentro de N dias, Inativo quando vencido) |
| Rede | **Ping** | alcançabilidade, latência, perda de pacotes |
| | **Porta TCP** | a porta aceita conexões |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, resposta esperada opcional, resolvedor escolhido |
| | **SNMP** | lê um OID (v1, v2c, v3) e compara o valor ou, em contadores, sua variação por segundo |
| | **Interface de rede (SNMP)** | uma porta de switch, roteador ou firewall: estado do link, tráfego de entrada e saída (bit/s e % da velocidade do link), erros; em gráfico ao longo do tempo |
| | **NTP** | alcançabilidade, stratum, desvio do relógio |
| | **SMTP** | saudação 220, EHLO, STARTTLS opcional |
| | **LDAP / Active Directory** | o diretório responde (Active Directory: degradado enquanto o controlador de domínio não estiver sincronizado), ou uma conta entra e uma pesquisa encontra entradas; indica contas bloqueadas, expiradas e desativadas |
| | **Vencimento de domínio** | vencimento do registro via RDAP (com WHOIS como alternativa) |
| Bancos de dados | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | conecta, consulta opcional com resultado esperado |
| Sistemas | **Comando SSH** | código de saída ou saída (contém, exata, regex), fixação opcional da chave do host |
| | **Contêiner Docker** | em execução, e saudável se tiver verificação de saúde |
| Infraestrutura | **VM do vCenter** | estado de energia, VMware Tools (vCenter 6.7, 7, 8) |
| | **Saúde HPE iLO / Redfish** | saúde do hardware do servidor pelo BMC (iLO 4/5/6, iDRAC, outros BMCs Redfish) |
| | **Temperatura de entrada (iLO / Redfish)** | temperatura do ar que entra no servidor, ou seja, na frente do rack: degradado a partir de 27 °C, inativo a partir de 32 °C (ASHRAE), com gráfico |
| | **Temperatura da sala** | todos os sensores de entrada com a tag `room:<name>` juntos: inativo quando vários estão quentes (problema de refrigeração), degradado quando um está quente ou vários sobem rápido |
| Passivo | **Heartbeat push** | um job chama uma URL; Inativo quando para de chamar |
| | **Traps SNMP** | traps que um equipamento envia (v1, v2c): inativo ou degradado enquanto houver um trap de problema aberto; termina sozinho, por um trap de encerramento ou manualmente |

**Testar agora** executa uma verificação uma vez a partir do servidor do Fudo sem salvar, para você
ajustá-la antes que comece a gerar alertas.

## Evitar alarmes falsos

- **Inativo após N falhas**: um monitor só fica Inativo após N verificações com falha seguidas,
  tentando de novo nesse meio-tempo no *intervalo de nova tentativa*, mais rápido.
- **Operacional após M sucessos**: só se recupera após M verificações bem-sucedidas seguidas.
- **Degradado acima de**: respostas lentas contam como Degradado em vez de Inativo.

## Credenciais

Senhas, communities SNMP, chaves SSH e afins são guardadas **criptografadas** e nunca mais são
exibidas, exportadas ou devolvidas pela API; só o worker as descriptografa para executar uma
verificação. Use contas somente leitura: uma função do vCenter *Read-only*, um usuário do iLO com o
privilégio *Login*, um usuário de banco de dados só com `CONNECT`/`SELECT`.

### Credenciais compartilhadas

Quando muitos monitores entram com a mesma conta (um usuário do iLO somente leitura para todos os
servidores, uma comunidade SNMP para os switches), guarde-a uma vez em **Credenciais** e deixe os
monitores usá-la. Quando a senha mudar, edite a credencial uma única vez: todo monitor que a usa
verifica de novo na hora com o novo valor.

- Uma credencial tem um tipo: *Conta e senha*, *Chave SSH*, *Comunidade SNMP (v1, v2c)* ou
  *Usuário SNMPv3*. No formulário do monitor, os tipos que fazem login oferecem **Informar aqui**
  ou **Usar uma credencial compartilhada**; com uma credencial, os campos da conta somem do
  formulário.
- As credenciais pertencem a um escopo: os monitores de um locatário só podem usar as credenciais
  desse locatário, e os monitores do escopo da infraestrutura global só as globais.
- Os segredos são somente escrita, como os de um monitor: guardados criptografados, nunca
  exibidos, exportados ou devolvidos. A lista mostra a conta e quais monitores a usam.
- **Mesma conta em vários monitores**: a página lista os monitores que já guardam a mesma conta e
  senha. Dê um nome ao grupo e escolha **Criar credencial compartilhada**: a senha é copiada no
  servidor, ninguém precisa conhecê-la.
- **Usar para…** associa mais monitores a uma credencial; a conta e a senha próprias deles são
  removidas. Uma credencial em uso não pode ser excluída nem mudar de tipo.
- Um monitor que deixa de usar uma credencial volta a precisar da própria senha.
- Na [configuração como código](configuration-as-code.md) um monitor cita sua credencial
  (`credential: iLO read-only`); a credencial em si é criada na interface. A inclusão em massa de
  verificações de temperatura também pode usá-la.
- Toda alteração fica no log de auditoria, com os nomes dos segredos alterados, nunca seus valores.

## Monitores push

Um monitor push espera que seu job o chame. Depois de salvar, a página dele mostra a URL:

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

Ele fica Inativo quando nenhuma chamada chega dentro do intervalo mais o período de tolerância.
**Nova URL** substitui o token se ele vazou.

## Adição em lote e modelos

**Monitores › Adição em lote / modelos** cria verificações para muitos hosts de uma vez:

1. cole um host ou URL por linha (ou carregue um CSV com `name,host,port`),
2. escolha um **modelo**, por exemplo *servidor Windows* (ping, RDP, WinRM), *servidor Linux*,
   *HPE iLO*, *dispositivo de rede*, *host ESXi*, *vCenter*, *SQL Server*, *storage* ou
   *aplicação web*, ou um único tipo de verificação,
3. opcionalmente crie um ativo por linha, faça-os depender de um ativo existente e adicione-os a
   uma aplicação.

Antes de aplicar, mostra uma prévia de tudo o que será criado.

## Observações por tipo

- **VM do vCenter** encontra sozinha a versão certa da API e reutiliza as sessões (um login por
  vCenter a cada 20 minutos). A verificação do VMware Tools exige vCenter 7.0 ou posterior.
- **HPE iLO / Redfish** nomeia a peça com defeito no HPE iLO (ventoinhas, fontes, storage,
  redundância). Warning → Degradado, Critical ou desligado → Inativo.
- **Comando SSH**: informe a *Impressão digital da chave do host* (`ssh-keyscan host | ssh-keygen -lf -`)
  para que uma chave de servidor alterada seja relatada em vez de aceita.
- **Contêiner Docker** usa o socket local do Docker (monte-o no contêiner do worker, veja
  `docker-compose.yml`) ou a URL de uma API Docker remota.
- **Vencimento de domínio**: alguns registros nacionais não publicam nem RDAP nem WHOIS; o Fudo
  informa isso como Degradado, com uma explicação.
- **Ping** precisa da capability `NET_RAW` no contêiner do worker, e no da API para **Testar agora**
  (ambas definidas no `docker-compose.yml`).

## Traps SNMP

Aponte os traps SNMP (v1 ou v2c) dos seus equipamentos para o servidor Fudo, porta UDP 162. A
página **Traps** mostra se os traps estão chegando, e cada trap com seus campos.

- Um monitor **Traps SNMP** recebe os traps dos equipamentos em **De**: endereços, nomes de host
  ou faixas IPv4 (`10.0.12.0/24`). Com uma **Comunidade** (ou uma credencial compartilhada do tipo
  comunidade SNMP), recebe só os traps que a trazem; a comunidade nunca é guardada.
- **Traps de problema**: os padrão (link down, partida a frio e a quente, falha de
  autenticação), só os traps listados (nomes ou OIDs; um OID também abrange tudo abaixo dele, ex.:
  o prefixo enterprise de um fabricante) ou qualquer trap. *Só quando um campo contém* restringe
  aos traps com um texto como `Critical`.
- Enquanto houver um problema aberto, o monitor fica **Inativo** (ou Degradado, se você
  escolher); incidente, notificações e plantão funcionam como em qualquer verificação, em menos
  de um segundo após o trap.
- Os problemas são registrados por trap e interface: link down em duas portas são dois problemas,
  e o **link up** de uma porta encerra só o problema dessa porta.
- **Os problemas terminam** automaticamente quando nenhum trap novo chega por um tempo (30
  minutos por padrão), ou só manualmente: a página do monitor lista os traps abertos com
  **Limpar** (até o próximo trap correspondente). *Traps de encerramento* também encerram
  problemas, ex.: o trap “condição resolvida” de um fabricante.
- Um trap **que nenhum monitor recebe** é guardado mesmo assim: no locatário do ativo com esse
  endereço, senão no escopo da infraestrutura global. **Criar monitor** na página Traps preenche
  um monitor para o equipamento dele.
- Um equipamento que inunda de traps é limitado (50 por segundo, picos de 500); os traps
  descartados são contados na página Traps do escopo global. Os traps ficam guardados por 30 dias
  (Configurações › Retenção de dados).

## Interfaces de rede

Um monitor **Interface de rede (SNMP)** acompanha uma porta de um switch, roteador ou firewall.

- **Encontrar interfaces…** (depois do host e do acesso SNMP, ou de uma credencial compartilhada)
  lista as interfaces do equipamento com descrição, velocidade e estado. Escolha uma ou, ao
  adicionar, marque várias: cada uma vira um monitor com as configurações do formulário, com o nome
  da interface.
- A interface é guardada pelo **nome** (ou descrição ou alias), não pelo número, porque alguns
  equipamentos renumeram as interfaces depois de reiniciar. Um número também funciona.
- O **tráfego** é a diferença entre duas leituras dos contadores de 64 bits: a primeira verificação
  lê duas vezes, com dois segundos de intervalo; as seguintes usam a leitura guardada da verificação
  anterior. Depois de um reinício do equipamento o par é descartado, então não há pico falso.
  Equipamentos sem contadores de 64 bits (SNMP v1) usam os de 32 bits, pouco confiáveis acima de
  cerca de 100 Mbit/s com intervalo de um minuto.
- **Estado**: link caído → Inativo; testing ou dormant → Degradado; uma porta desativada de
  propósito fica Operacional (ou Inativo, se você escolher). O sentido mais carregado acima de
  *Degradado a partir de utilização de* (80 % por padrão) → Degradado, acima de *Inativo a partir
  de utilização de* (desligado por padrão) → Inativo; erros por minuto acima do limite →
  Degradado. Se o equipamento informar a velocidade errada (um túnel, um circuito com limite de
  taxa), preencha *Velocidade do link*.
- A página do monitor mostra o tráfego de entrada e saída com a linha de Degradado.
- *Comparar: sua variação por segundo* do monitor **SNMP** faz o mesmo para qualquer contador
  (quadros de uma porta SAN, sessões de um firewall, eventos de um nobreak).

## Temperatura do data center

**Temperatura** mostra cada sensor de temperatura de entrada, agrupado pela tag `room:<name>` e ordenado do mais quente para o mais frio, com o rack (`rack:<name>`), o valor atual, as últimas 6 horas, a variação em 15 minutos e a faixa de 24 horas. **Adicionar sensores** os cria para uma lista de endereços iLO (ou outros BMCs Redfish) com uma conta compartilhada somente leitura.

Um sensor também fica degradado quando a temperatura **sobe rápido** (por padrão 3 °C em 15 minutos), mesmo abaixo dos limites: o primeiro sinal de falha na refrigeração. **Criar alerta da sala** adiciona um monitor *Temperatura da sala*: inativo quando 3 sensores estão quentes, degradado quando um está quente ou 2 sobem rápido. Ele abre incidentes como qualquer monitor, então donos, plantões e páginas de status também funcionam para ele.
