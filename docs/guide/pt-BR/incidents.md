<!-- translation-of: incidents.md#4e781264 -->
# Incidentes

O Fudo abre incidentes sozinho quando algo falha e os resolve quando se recupera.

## Quando um incidente é aberto

| Item | Abre um incidente quando | Gravidade |
|---|---|---|
| **Aplicação** | está Inativa, ou Impactada por uma causa não agendada | pela criticidade: crítica → Crítico, alta → Maior, demais → Menor |
| **Ativo** | está Inativo (é uma causa raiz) | Maior |
| **Monitor** | está Inativo e não faz parte de um ativo ou aplicação | Menor |

Um incidente **Impactado** é ligado ao incidente da sua causa raiz (*Causado por INC-…*): um switch
com falha gera um incidente raiz com incidentes impactados claramente ligados, e não uma enxurrada
de alertas.

## Ciclo de vida de um incidente

1. É **aberto** automaticamente e as notificações saem (veja [Notificações](notifications.md)).
2. **Reconhecer** mostra que alguém está cuidando; lembretes e escalonamentos param.
3. **Silenciar** cala as notificações por um tempo (30 minutos a 1 dia) sem reconhecer.
4. É **resolvido** automaticamente quando o item se recupera. Se falhar de novo em 5 minutos, o
   mesmo incidente é **reaberto** em vez de criar um novo. Você também pode resolvê-lo manualmente.

A **linha do tempo** registra cada passo: mudanças de status, notificações, reconhecimentos e notas.

## Notas: compartilhe o que aprendeu

Adicione notas à linha do tempo como **Comentário**, **Ação realizada** ou **Resolução**, com tags
(ex.: `supervisor`, `firmware`).

As resoluções são reaproveitadas: quando um incidente parecido acontece depois (mesmo item, mesma
causa raiz, tags em comum ou texto semelhante), **Incidentes anteriores semelhantes** mostra o que
resolveu, e os alertas dele citam isso: *"Da última vez (INC-0041, 12 ago 2026) foi resolvido
assim: …"*.

## Encontrar incidentes

**Incidentes** lista os incidentes **abertos** do escopo escolhido na barra lateral; mude para
*Resolvido* para ver o histórico e pesquise por título, número INC ou tag. Os incidentes de outro
locatário aparecem quando você muda para ele (veja [Solução de problemas](troubleshooting.md)).

## Relatórios pós-incidente

**Relatório pós-incidente** em um incidente baixa um relatório em **PDF** ou **Markdown** (para um wiki ou um chamado): um resumo com os horários e quem reconheceu e resolveu, os incidentes impactados, a resolução e as ações realizadas, a linha do tempo, as notificações enviadas e incidentes anteriores semelhantes. Usa o seu idioma e o seu fuso horário, e pode ser gerado com o incidente ainda aberto.
