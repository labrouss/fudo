<!-- translation-of: dashboards-and-reports.md#254ddd09 -->
# Painéis e relatórios

## Visão geral

Incidentes abertos, tempo médio de recuperação (MTTR, 30 dias), monitores operacionais e com falha,
aplicações dentro da meta de SLA e um cartão por aplicação com sua faixa de disponibilidade de 30
dias. As páginas se atualizam ao vivo (cerca de um segundo após uma mudança); a barra lateral mostra
**Ao vivo** enquanto houver conexão.

A **disponibilidade** vem do histórico de status: o tempo inativo e impactado conta contra ela; a
manutenção agendada e o tempo antes da primeira verificação, não.

## Gráficos

Cada monitor mostra seu tempo de resposta em 1 h, 6 h, 24 h, 7, 30 e 90 dias (média, p95, falhas,
manutenção), as últimas verificações como faixa de batimentos, as mudanças de status e os
resultados recentes.

## Relatórios

**Relatórios** mostra, por aplicação (ou por ativo compartilhado no escopo Infraestrutura global):
disponibilidade 24/7 e em **horário comercial**, tempo inativo, manutenção agendada, incidentes, SLA
atingido ou não, MTTA (tempo até reconhecer) e MTTR (tempo até resolver). Escolha a semana passada,
o mês passado, os últimos 30 dias ou datas próprias, e baixe como:

- **PDF**: no seu idioma; os relatórios em árabe são diagramados da direita para a esquerda,
- **CSV**: disponibilidade e incidentes, UTF-8 para o Excel, com nomes de colunas em inglês para que
  planilhas e scripts continuem funcionando.

## Relatórios agendados

**Relatórios › Novo agendamento** envia por e-mail o PDF e/ou o CSV toda segunda-feira (semana
anterior) ou no dia 1º (mês anterior), no horário e fuso escolhidos, no idioma do agendamento, pelo
servidor SMTP das Configurações. **Enviar agora** envia na hora o último período.

## Páginas de status

**Páginas de status › Nova página de status** mostra aplicações, ativos e monitores escolhidos em
uma página própria em `/status/<endereço>`, com o status geral, 90 dias de disponibilidade, os
incidentes atuais e as manutenções. Cada item recebe um **nome exibido**, mostrado no lugar do nome
interno; itens do mesmo grupo aparecem juntos. Páginas de um locatário podem incluir infraestrutura
compartilhada.

- **Pública**: qualquer pessoa com o link, sem entrar. A página mostra só nomes exibidos e status
  simples (*Operacional, Degradado, Interrupção, Manutenção*), nunca nomes internos, causas, títulos
  de incidentes ou nomes de manutenções.
- **Interna**: usuários conectados com acesso ao locatário, que também veem os títulos dos incidentes
  e os nomes das manutenções.

A página se atualiza a cada minuto e usa o idioma e o modo claro ou escuro do visitante.
