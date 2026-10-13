<!-- translation-of: settings.md#401e7e53 -->
# Configurações

**Configurações** (no fim da barra lateral) reúne suas preferências pessoais, para todos, e as
configurações do sistema, para os superadmins.

Cada seção é uma aba. O endereço guarda a aba aberta (por exemplo `/settings#retention`), então uma aba pode ser salva nos favoritos ou enviada como link.

## Suas preferências

- **Idioma da interface**: 13 idiomas, inclusive o árabe com layout da direita para a esquerda. Fica
  salvo no seu perfil, então acompanha você em qualquer navegador. Os títulos de incidentes e os
  resultados das verificações também são traduzidos.
- **Tema**: **Sistema** (segue o modo claro ou escuro do sistema operacional), **Claro**,
  **Escuro**, **Monokai**, além dos temas que o seu administrador adicionar.

## Configurações do sistema (superadmins)

### Idioma das notificações

**Idioma padrão** das notificações e dos relatórios agendados. Cada canal e cada agendamento pode
usar o seu; os e-mails para uma pessoa (convites, redefinições) usam o idioma dela. Não muda a
interface: cada pessoa a escolhe em *Preferências*.

### E-mail (SMTP)

Usado para convites, alertas por e-mail e relatórios agendados.

| Campo | Observações |
|---|---|
| Host SMTP, porta | 587 (STARTTLS) ou 465 (*Usar TLS desde o início*); 25 para um relay interno |
| Usuário, senha | opcionais; a senha é guardada criptografada e nunca mais exibida |
| Endereço do remetente | ex.: `fudo@corp.local` |
| **Aceitar certificados autoassinados** | para um relay local com certificado autoassinado ou interno: a conexão continua criptografada, só a verificação do certificado é ignorada |

**Enviar e-mail de teste** mostra o motivo exato quando algo dá errado: um certificado não
confiável, uma senha errada, um servidor inacessível ou um modo TLS que não corresponde à porta.

## Para administradores

Novos idiomas e temas podem ser adicionados colocando arquivos em pastas, sem recompilar; veja
`locales/README.md` e `themes/README.md` no repositório.

## Retenção de dados

**Configurações › Retenção de dados** (superadmins) define por quanto tempo cada tipo de dado é guardado e mostra o espaço ocupado: resultados brutos das verificações, resumos por hora e diários, histórico de status, incidentes resolvidos, log de notificações, log de auditoria e janelas de manutenção concluídas. Dados antigos são removidos a cada hora, aos poucos. Mínimos protegem o que o Fudo mostra (gráficos de 90 dias, relatórios de disponibilidade, páginas de status), e a última mudança de status antes do limite é sempre mantida, para que a disponibilidade continue exata. Incidentes abertos e notificações ainda por enviar nunca são removidos.
