<!-- translation-of: concepts.md#61c26734 -->
# Conceitos

## Escopos: locatários e infraestrutura global

| Escopo | Contém | Gerenciado por |
|---|---|---|
| **Locatário** (um por unidade de negócio) | suas aplicações, monitores, ativos, canais e relatórios | administradores de locatário |
| **Infraestrutura global** | ativos compartilhados (switches, storages, fabrics FC, clusters) e seus monitores | administradores de infraestrutura e superadmins |

Escolha o escopo no seletor no topo da barra lateral. Os locatários veem a infraestrutura
compartilhada somente para leitura e ligam a ela seus próprios monitores e aplicações, então uma
falha de storage aparece como causa em cada aplicação que depende dele.

## Peças básicas

| Peça | O que é | Exemplo |
|---|---|---|
| **Monitor** | uma verificação executada periodicamente | HTTPS em `erp.corp.local/health` |
| **Ativo** | uma peça de infraestrutura, verificada pelos seus monitores | `Core-SW-01`, `SAN-A` |
| **Aplicação** | um serviço de negócio: monitores (membros) mais a infraestrutura de que precisa | *ERP Production* |
| **Dependência** | "isto precisa daquilo": ativo → ativo, aplicação → ativo | cluster ESXi → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

Em um ativo, **Adicionar existentes** coloca nele monitores que você já tem (um que está em outro ativo é movido) e **Novo monitor** abre o formulário de monitor para ele. Um locatário também pode colocar seus próprios monitores em um ativo global compartilhado; **Remover** tira um monitor do ativo e o mantém.

## Status

| Status | Significado |
|---|---|
| **Operacional** | funcionando |
| **Degradado** | funcionando, mas lento ou parcialmente (ex.: um membro opcional está inativo) |
| **Inativo** | falhando, e nada de que depende explica isso: é uma **causa raiz** |
| **Impactado** | falhando **porque** algo de que depende está inativo; os alertas apontam a causa raiz |
| **Em risco** | funcionando, mas algo de que depende tem um problema |
| **Manutenção** | em uma janela de manutenção agendada: não conta contra a disponibilidade |
| **Pendente** | ainda sem resultado |

## Como o Fudo encontra a causa raiz

| Situação | Resultado |
|---|---|
| As verificações de um ativo falham e nada de que depende está inativo | **Inativo**: causa raiz, com incidente próprio |
| As verificações dele falham **e** algo de que depende está inativo | **Impactado por** essa causa raiz: sem enxurrada de alertas |
| As verificações dele passam, mas algo de que depende está inativo | mantém o status, marcado **Em risco** |
| Algo de que depende está em manutenção agendada | **Impactado por manutenção** (agendada, fora da disponibilidade) |

Uma aplicação está saudável quando seus membros estão, de acordo com a regra dela: **todos os
membros obrigatórios operacionais**, **pelo menos um** ou **pelo menos N de M** (para serviços
redundantes). Os membros obrigatórios decidem o status; os opcionais só podem deixá-la *Degradada*.

**E se isto falhar?** em um ativo prevê quais aplicações cairiam, e quais resistiriam graças à
redundância, antes de desligá-lo para manutenção.

A página **Topologia** desenha tudo com status ao vivo: passe o mouse sobre um item para seguir suas
dependências; *Somente problemas* mostra o que está falhando e o que depende disso.
