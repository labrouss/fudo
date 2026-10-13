<!-- translation-of: troubleshooting.md#0d0eae59 -->
# Solução de problemas

### Recebi um alerta, mas a lista de incidentes está vazia

- **Outro locatário**: a lista mostra o escopo escolhido na barra lateral. Um canal com *todos os
  locatários* recebe os incidentes de cada locatário; mude de locatário para vê-los.
- **Já resolvido**: quedas curtas abrem e fecham um incidente em minutos; veja em *Resolvido*.
- **Não é do Fudo**: as mensagens de chat do Fudo começam com **[Fudo]** e nunca trazem códigos de
  erro brutos como `EHOSTUNREACH`. Se outra ferramenta de monitoramento (por exemplo o Uptime Kuma)
  ainda publica no mesmo chat, o alerta veio dela. O **Log** do canal lista tudo o que o Fudo enviou.

### Um monitor falha com "Host inacessível" ou "Tempo esgotado"

A verificação roda no contêiner **worker** do Fudo, não no seu computador. Confira se o host do
worker alcança o alvo (roteamento, firewalls). Para o ping, os contêineres precisam da capability
`NET_RAW` (definida no `docker-compose.yml`).

### "O certificado do servidor SMTP não é confiável"

Seu relay de e-mail usa um certificado autoassinado ou interno. Ative **Aceitar certificados
autoassinados** em Configurações › E-mail (SMTP).

### Tudo atrás de um switch ficou vermelho ao mesmo tempo

É o esperado, e o Fudo cuida disso: o switch está **Inativo** (causa raiz) e o que está atrás dele
está **Impactado**. Você recebe um incidente raiz com os outros ligados a ele. Confira se as
dependências estão modeladas (o ativo *depende do* switch) para que o Fudo saiba disso.

### Uma mudança agendada acionou o plantão

Crie antes uma [janela de manutenção](maintenance.md) para os ativos afetados: as verificações
continuam, mas os alertas são suprimidos e o tempo não conta contra a disponibilidade.

### Os incidentes de uma aplicação não chegam a ninguém

Abra a aplicação: o cartão **Notificações** avisa quando nenhum canal recebe os incidentes dela (por
exemplo quando todos os canais estão em *Somente incidentes das aplicações selecionadas* sem ela).

### A página mostra "Reconectando às atualizações ao vivo"

O navegador perdeu a conexão com a API; as páginas voltam a se atualizar sozinhas assim que ela
retorna. Se continuar, verifique se um proxy na frente do Fudo permite conexões longas (Server-Sent
Events) para `/api/live`.

### Perdi meu celular

Entre com um código de recuperação ou peça a um administrador para **redefinir o 2FA** da sua conta.
