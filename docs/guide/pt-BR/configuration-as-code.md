<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# Configuração como código

**Configuração** exporta o escopo atual (ativos, monitores, aplicações e suas dependências) em YAML e
o importa de volta. Guarde no git, copie a configuração de um locatário para outro ou automatize
pela API.

```yaml
assets:
  - name: FIN-APPLIANCE-01
    kind: other
    dependsOn: [Core-SW-01]          # shared assets are referenced by name
monitors:
  - name: ERP web
    type: http
    config: { url: https://erp.corp.local/health, acceptedStatus: 200-299 }
    asset: FIN-APPLIANCE-01          # the asset this monitor checks
    tags: [prod]
applications:
  - name: ERP Production
    criticality: high
    slaTarget: 99.9
    members: [ERP web, { monitor: ERP SQL, required: false }]
    notify: [ERP team]               # notification channels, by name
```

## Como a importação funciona

- **Primeiro, uma prévia**: lista o que será criado ou alterado, campo a campo, e aponta erros com o
  número da linha. **Aplicar** é tudo ou nada.
- **Arquivos parciais são seguros**: um item do arquivo define esse item; o que não está no arquivo
  continua como está.
- **Não incluídos**: canais de notificação e credenciais (contêm segredos) e janelas de manutenção.
  Monitores push importados recebem URLs novas. As aplicações citam seus canais pelo nome em
  `notify`; sem `notify`, uma aplicação mantém os canais atuais.
- **Credenciais compartilhadas**: um monitor cita pelo nome a que usa (`credential: iLO
  read-only`). A credencial em si não é exportada e precisa já existir no escopo de destino.

## Pela API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

Exige um token de API com a permissão **Gerenciar** (veja [Usuários e acesso](users-and-access.md)).

## Importar do Uptime Kuma

**Configuração › Importar do Uptime Kuma** lê o backup JSON do Uptime Kuma 1.x (*Configurações › Backup › Exportar*) ou o arquivo de banco de dados `kuma.db` das versões 1.x e 2.x (na pasta de dados do Kuma). Você vê uma prévia antes; nada muda até importar.

Verificações HTTP, de palavra-chave e JSON simples, porta TCP, ping, DNS e push são importadas com intervalos, novas tentativas, tags e estado de pausa; a validade de certificados HTTPS vira um monitor de certificado à parte, e os grupos viram aplicações. As notificações viram canais com as mesmas configurações (as de e-mail usam o servidor de e-mail das Configurações) e começam desativadas, salvo escolha diferente. Itens cujo nome já existe não são alterados, então importar de novo é seguro. Tudo o que não pode ser importado fielmente (por exemplo monitores Docker ou de banco de dados, ou o modo invertido) aparece com o motivo.
