<!-- translation-of: users-and-access.md#c2bf850f -->
# Usuários e acesso

## Funções

| Função | Onde | Pode |
|---|---|---|
| **Superadmin** | em todo lugar | tudo, inclusive usuários, locatários e configurações |
| **Administrador de infraestrutura** | escopo Infraestrutura global (e cada locatário) | gerenciar a infraestrutura compartilhada e os dados de todos os locatários |
| **Administrador de locatário** | um locatário | gerenciar o locatário: monitores, ativos, aplicações, canais, relatórios, tokens de API |
| **Operador** | um locatário | ver tudo; pausar, retomar e testar monitores, reconhecer, silenciar e resolver incidentes, adicionar notas |
| **Visualizador** | um locatário | ver tudo, sem alterar nada |

Um usuário pode ter uma função diferente em cada locatário. Os superadmins gerenciam usuários e
locatários em **Administração**.

## Convites e acesso

**Administração › Usuários › Convidar usuário**: nome, e-mail, o **idioma** do usuário (para o e-mail
de convite e o primeiro acesso) e as funções dele. Ele recebe um link de uso único (válido por 72
horas) para escolher uma senha e configurar a **autenticação em dois fatores**, que é obrigatória.
Se o e-mail não estiver configurado, copie o link da janela e envie você mesmo.

Perdeu o celular? Entre com um dos **códigos de recuperação**. Um administrador também pode
**Redefinir 2FA** (a senha continua) ou **Redefinir senha e 2FA** na janela do usuário; o usuário
recebe um link novo.

As contas são bloqueadas por 15 minutos após 5 tentativas erradas de senha ou de código.

## Desativar e excluir usuários

**Desativar** bloqueia o acesso na hora e mantém a conta. **Excluir usuário** remove a conta com
sessões, funções e 2FA; incidentes, notas e o log de auditoria mantêm o histórico (exibido como
*name@example (excluído)*). Você não pode excluir a si mesmo nem o último superadmin ativo.

## Tokens de API

**Acesso à API** (administradores de locatário por locatário, administradores de infraestrutura no
escopo Infraestrutura global) cria tokens com uma permissão:

| Permissão | Permite |
|---|---|
| **Ler** | ver monitores, incidentes e relatórios |
| **Operar** | também pausar/retomar, reconhecer, notas, testes |
| **Gerenciar** | também criar, alterar e excluir |

Um token só funciona no seu escopo, pode expirar, pode ser revogado e nunca pode gerenciar
usuários, locatários, configurações ou outros tokens. Ele é exibido uma única vez; só um hash é
guardado.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

A documentação da API está embutida em **/api/docs** (funciona offline); a especificação legível por
máquina fica em `/api/openapi.json`.

## Log de auditoria

**Administração › Log de auditoria** registra acessos e falhas, bloqueios, convites e cada alteração
em usuários, locatários e configurações, com os valores antes e depois.

## Seu perfil

Em **Perfil** (no fim da barra lateral) você muda seu nome e sua senha, passa a autenticação em dois
fatores para um celular novo (o antigo funciona até você confirmar o novo), recebe novos códigos de
recuperação, e vê suas sessões para encerrar as outras. Mudar a senha ou o celular encerra suas outras
sessões.

As abas: **Seus dados**, **Senha**, **Autenticação em dois fatores**, **Sessões** e **Plantão** (seus plantões, formas de contato e passos de notificação). O endereço guarda a aba aberta, por exemplo `/profile#sessions`.

As **formas de contato** são como o Fudo avisa você pessoalmente, por exemplo no plantão: e-mail, um
workflow do Microsoft Teams que escreve no seu chat, ou Telegram (quando um administrador conectar um
bot do Telegram nas *Configurações*). Cada uma é confirmada antes com um código de 6 dígitos. **Seus
passos de notificação** dizem quais formas usar e quando, por exemplo e-mail na hora e Telegram após 5
minutos, até o incidente ser reconhecido.

## Equipes e responsabilidade

**Equipes** reúne os responsáveis por aplicações e infraestrutura, por exemplo uma *Equipe de banco
de dados* em um locatário ou uma *Equipe de storage* no escopo Infraestrutura global. Cada pessoa é
**membro** ou **líder**; só podem ser adicionadas pessoas com acesso ao escopo da equipe.

Escolha a **equipe dona** na página de uma aplicação ou de um ativo. Assim cada incidente mostra o
dono e os líderes, inclusive incidentes de monitores (por meio do ativo ou da aplicação deles), assim
como os relatórios pós-incidente. Itens de um locatário pertencem a equipes do locatário; a
infraestrutura compartilhada, a equipes globais. Os plantões são definidos por equipe.
