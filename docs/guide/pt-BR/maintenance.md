<!-- translation-of: maintenance.md#f097f823 -->
# Janelas de manutenção

Planeje intervenções para que não alertem ninguém e não contem contra a disponibilidade.

**Manutenção › Agendar manutenção**: informe título, início e fim, notas (pedido de mudança,
contato, plano de reversão) e o que ela **cobre**: ativos (com suas verificações) e monitores.

Durante a janela:

- as verificações continuam, para você ver o que acontece,
- os resultados delas são **excluídos da disponibilidade** e do SLA,
- os **alertas são suprimidos**,
- o que depende de algo em manutenção mostra isso como causa (*Impactado por manutenção*), para
  ninguém correr atrás de uma parada agendada.

**Encerrar agora** fecha uma janela antes do previsto. As janelas aparecem como *Agendada*, *Em
andamento* ou *Concluída*.

Dica: use antes **E se isto falhar?** no ativo para ver quais aplicações a intervenção vai afetar.

## Manutenção recorrente

Escolha **Repetir** ao agendar: todos os dias, toda semana nos dias escolhidos, ou todo mês, em um dia
do mês (o dia 31 cai no último dia dos meses mais curtos) ou em um dia de uma semana (a *terça-feira
da segunda semana* é o Patch Tuesday da Microsoft). Os horários são no fuso escolhido, então 02:00
continua 02:00 após a mudança de horário; um horário de fim anterior ao início significa o dia
seguinte.

O Fudo cria as janelas dos próximos 60 dias, marcadas com **Repete**. **Pular** remove uma
ocorrência, e editar uma janela muda só essa ocorrência. Editar a série muda as janelas futuras dela;
excluí-la as remove, enquanto as passadas e as em andamento permanecem.
