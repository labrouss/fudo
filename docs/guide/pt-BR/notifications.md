<!-- translation-of: notifications.md#5487cd95 -->
# Notificações

## Canais

**Notificações › Adicionar canal**. Integrados: **E-mail** (precisa do servidor SMTP das
Configurações), **Microsoft Teams** (webhook do Workflows), **Slack** (incoming webhook) e
**Webhook (JSON)**. Mais de 100 outros (Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover,
Signal, Twilio e outros gateways de SMS, Mattermost, Matrix, Google Chat, …) vêm dos provedores de
notificação do Uptime Kuma. **Enviar teste** verifica um canal; o **Log** mostra cada envio e por
que um canal foi ignorado.

As mensagens de chat começam com **[Fudo]**, para distingui-las facilmente de outras ferramentas
que publicam no mesmo chat.

## Quais incidentes um canal recebe

| Configuração | Efeito |
|---|---|
| **Enviar** | *Todos os incidentes deste locatário* (padrão) ou *Somente incidentes das aplicações selecionadas* |
| **Gravidade mínima** | Menor e acima (todos), Maior e Crítico, ou somente Crítico |
| **Eventos** | abertura, reconhecimento, resolução |
| **Ignorar incidentes causados por outro incidente** | somente causas raiz, não os incidentes impactados ligados a elas |
| **Lembrar enquanto não reconhecido** | repete a cada N minutos enquanto ninguém reconhecer |
| **Idioma das mensagens** | o idioma do canal; padrão: o da organização (Configurações) |

Os canais de um locatário recebem os incidentes dele, inclusive os causados pela infraestrutura
compartilhada (com a causa raiz na mensagem). Os canais globais recebem incidentes de
infraestrutura; com **todos os locatários** (um canal de NOC), recebem também os incidentes de cada
locatário, exceto os causados por um incidente de infraestrutura que já receberam.

**Por aplicação:** um canal com *Somente incidentes das aplicações selecionadas* só fica sabendo
dessas. Escolha-as no formulário do canal, ou na página de uma aplicação, no cartão
**Notificações**, que também avisa quando os incidentes de uma aplicação não chegam a nenhum canal.

## Escalonamento

Dê um atraso a um canal (**Escalar: sem reconhecimento após 15 min**) e ele vira uma etapa de
escalonamento: só é notificado se, depois desse tempo, o incidente continuar aberto, sem
reconhecimento e sem silêncio, e depois recebe o reconhecimento e a resolução. Encadeie vários:
Teams na hora → SMS do plantão após 15 minutos → gestor após 60 minutos.

## Entrega

As mensagens passam por uma fila de saída com novas tentativas (após 1, 5 e 15 minutos) e um limite
de envio por canal, para que uma enxurrada de incidentes não faça seu bot ou seu relay de e-mail
serem bloqueados.

## Conteúdo do webhook

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

Defina um **segredo de assinatura** para receber `X-Fudo-Signature: sha256=<HMAC do corpo>`. O
conteúdo continua em inglês (é um formato estável para integrações); `incident.titleParts` traz o
título como códigos de mensagem, caso você queira traduzi-lo.

## Plantões

As equipes avisam pessoas sobre incidentes dos itens dos quais são donas. Em **Equipes › Plantão**,
coloque os membros na ordem do rodízio, escolha a duração do plantão (um dia, uma semana, duas semanas
ou um número de dias), o horário da troca e o fuso, e os incidentes que geram aviso. Os passos de
**escalonamento** dizem quem é avisado e quando, a partir da abertura do incidente: por exemplo a pessoa
de plantão na hora, a próxima após 15 minutos e os líderes após 30. As **substituições** deixam outra
pessoa cobrir um período, como uma troca ou férias.

Cada pessoa é avisada pelos próprios passos de notificação (veja *Seu perfil*), ou por e-mail no
endereço de login se não tiver nenhum. Os avisos param assim que alguém reconhece o incidente e ficam em
pausa enquanto ele está silenciado. A página do incidente mostra quem foi avisado e o que foi enviado;
seu perfil mostra seus próximos plantões.

As mensagens de plantão incluem os links **Reconhecer** e **Abrir no Fudo** (defina `PUBLIC_URL`). Reconhecer abre uma página onde um toque reconhece o incidente em seu nome, sem entrar; só abrir o link não muda nada, então pré-visualizações de links e verificadores de e-mail não reconhecem por engano. Cada link funciona uma vez, por 24 horas, enquanto o incidente está aberto, e só se sua função permitir reconhecer incidentes.
