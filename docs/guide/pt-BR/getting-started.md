<!-- translation-of: getting-started.md#ea57bfb7 -->
# Primeiros passos

O Fudo mostra se suas aplicações de negócio estão funcionando, **por que** estão inativas e o que
resolveu problemas parecidos antes. Esta página leva você de uma instalação nova até o primeiro
alerta.

## 1. Primeiro acesso

Depois da instalação (veja [Instalação](../../admin/installation.md)), abra o Fudo no navegador.
O **assistente de configuração** pede:

1. o nome da sua organização,
2. o primeiro administrador (nome, e-mail, senha de pelo menos 12 caracteres),
3. a autenticação em dois fatores: leia o código QR com um aplicativo autenticador (Microsoft
   Authenticator, Google Authenticator, 1Password, …) e **guarde os códigos de recuperação**,
4. opcionalmente o servidor de e-mail (SMTP), usado para convites, alertas e relatórios. Você
   também pode configurá-lo depois em **Configurações**.

A autenticação em dois fatores é obrigatória para todas as contas.

## 2. Crie um locatário

Um **locatário** é uma unidade de negócio, por exemplo *Financeiro* ou *RH*. As aplicações, os
monitores e os canais de notificação dele ficam separados dos de outros locatários. Vá em
**Administração › Locatários › Novo locatário** e escolha-o no seletor no topo da barra lateral.

A infraestrutura compartilhada (switches de núcleo, storages, clusters) fica no escopo
**Infraestrutura global**; veja [Conceitos](concepts.md).

## 3. Adicione um monitor

**Monitores › Adicionar monitor**, escolha um tipo (por exemplo *HTTP(S)* ou *Ping*), informe o
alvo e clique em **Testar agora** para executar a verificação uma vez sem salvar. Salve; os
resultados aparecem em um intervalo de verificação. Para muitos hosts de uma vez, use **Adição em
lote / modelos**; veja [Monitores](monitors.md).

## 4. Agrupe monitores em uma aplicação

**Aplicações › Nova aplicação** e adicione os monitores que compõem o serviço (front-end web, API,
banco de dados). O status da aplicação mostra se o serviço funciona e, se não, por quê. Defina uma
**meta de SLA** para acompanhá-la nos relatórios.

## 5. Receba notificações

**Notificações › Adicionar canal**: e-mail, Microsoft Teams, Slack, um webhook JSON ou um de mais de
100 outros (Telegram, PagerDuty, gateways de SMS, …). **Enviar teste** verifica o canal. Veja
[Notificações](notifications.md).

## 6. Convide seus colegas

**Administração › Usuários › Convidar usuário**: escolha o idioma e a função de cada um por
locatário. Eles recebem um link de uso único para escolher uma senha e configurar a autenticação em
dois fatores. Veja [Usuários e acesso](users-and-access.md).

## Próximos passos

- [Conceitos](concepts.md): escopos, ativos, dependências e como o Fudo encontra a causa raiz
- [Incidentes](incidents.md): o que acontece quando algo falha
- [Solução de problemas](troubleshooting.md): perguntas frequentes
