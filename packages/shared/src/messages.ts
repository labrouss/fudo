/**
 * Server-generated messages (check results, incident titles) are stored as parts, not finished
 * English, so each viewer sees them in their own language and history re-translates too:
 *
 *   [["tcp.open", { port: 3000 }], ["latency", { ms: 1 }]]      → "Port 3000 open · 1 ms"
 *   ["Health OK", ...]                                            plain strings are shown as they are
 *                                                                 (text from the device: banners, models)
 * A parameter value "@code" is itself a message code (e.g. a VM power state) and is translated too.
 * Translations live in locales/<lang>.json under "msg.<code>"; English templates are below.
 */
import { formatMessage } from "./i18n-core.js";

export type MsgParams = Record<string, string | number>;
export type MsgPart = string | [code: string, params?: MsgParams];

export const MESSAGES: Record<string, string> = {
  // incidents
  "incident.down": "{name} is down",
  "incident.impacted": "{name} impacted by {cause}",
  "incident.reopened": "Failed again within minutes of recovering",
  "incident.recovered": "Recovered ({status})",
  "incident.plannedMaintenance": "In planned maintenance",
  "incident.unmonitored": "No longer monitored (deleted or now covered by an asset or application)",
  "similar.sameItem": "same item",
  "similar.sameCause": "same root cause",
  "similar.sharedTags": "{n, plural, one {# shared tag} other {# shared tags}}",
  "similar.text": "similar description",
  "state.UP": "up", "state.DEGRADED": "degraded", "state.DOWN": "down", "state.IMPACTED": "impacted", "state.MAINTENANCE": "maintenance", "state.UNKNOWN": "unknown",
  // application / asset summaries and status changes
  "eval.cycle": "dependency cycle",
  "eval.maintenance": "In maintenance",
  "eval.notMonitored": "Not monitored",
  "eval.checksUp": "{up} of {total} checks up",
  "eval.paused": "Paused",
  "eval.noRequired": "No required members",
  "eval.requiredHealthy": "{healthy} of {total} required healthy",
  "eval.needs": "needs {n}",
  "change.impactedBy": "Impacted by {cause}",
  "change.impactedByPlanned": "Impacted by {cause} (planned maintenance)",
  "change.causeDown": "{cause} is down",
  // common
  "latency": "{ms} ms",
  "auth.failed": "Authentication failed",
  "auth.failedFor": "Authentication failed for {user}",
  // network errors
  "net.timeout": "Timed out after {s}s",
  "net.refused": "Connection refused",
  "net.notFound": "Host name not found",
  "net.dnsTemp": "DNS lookup failed (temporary)",
  "net.hostUnreach": "Host unreachable",
  "net.netUnreach": "Network unreachable",
  "net.reset": "Connection reset by peer",
  "tls.certExpired": "TLS certificate has expired",
  "tls.selfSigned": "TLS certificate is self-signed (not trusted)",
  "tls.chain": "TLS certificate chain is not trusted",
  "tls.hostMismatch": "TLS certificate does not match the host name",
  // TCP, HTTP
  "tcp.open": "Port {port} open",
  "http.unexpected": "Unexpected status {status}",
  "http.keywordFound": "Keyword \"{keyword}\" found",
  "http.keywordMissing": "Keyword \"{keyword}\" not found",
  "http.notJson": "Response is not valid JSON",
  "http.jsonMissing": "{path} not found in response",
  "http.jsonMismatch": "{path} is \"{actual}\", expected \"{expected}\"",
  // databases
  "db.connected": "Connected",
  "db.connectedTo": "Connected ({server})",
  "db.commandOk": "{command} ok",
  "db.result": "result: {result}",
  "db.notContains": "Result \"{result}\" does not contain \"{expected}\"",
  "db.notEquals": "Result \"{result}\" does not equal \"{expected}\"",
  "db.pingReply": "Unexpected PING reply: {reply}",
  "db.badJson": "The command is not valid JSON",
  // DNS
  "dns.missing": "Answer {answer} does not contain {expected}",
  "dns.empty": "Empty answer, expected {expected}",
  "dns.noRecord": "No {type} record for {name}",
  // Docker
  "docker.noSocket": "Docker socket {path} not found (mount it into the worker container)",
  "docker.noPermission": "No permission to use {path}",
  "docker.notFound": "Container \"{name}\" not found",
  "docker.http": "Docker API HTTP {status}",
  "docker.state": "{name} is {state}",
  "docker.exitCode": "exit code {code}",
  "docker.restarting": "{name} is restarting",
  "docker.unhealthy": "{name} is unhealthy",
  "docker.starting": "{name} health check is starting",
  "docker.running": "{name} running",
  "docker.healthy": "healthy",
  "docker.since": "since {since}",
  // domain expiry
  "domain.noService": "No RDAP or WHOIS service for .{tld}; expiry cannot be checked automatically",
  "domain.noExpiry": "{server} does not publish an expiry date for {domain}",
  "domain.expired": "Expired on {date}",
  "domain.expires": "Expires {date} ({days, plural, one {# day} other {# days}})",
  // NTP
  "ntp.noResponse": "No NTP response after {s}s",
  "ntp.invalid": "Invalid NTP response",
  "ntp.kod": "Kiss-o'-death from server: {code}",
  "ntp.unsync": "Server is not synchronised (stratum 16)",
  "ntp.stratumAbove": "Stratum {stratum} is above {max}",
  "ntp.stratum": "Stratum {stratum}",
  "ntp.offset": "offset {offset} ms",
  "ntp.offsetLimit": "offset {offset} ms (limit {limit} ms)",
  // ping, push
  "ping.missing": "ping is not installed on this probe",
  "ping.failed": "Ping failed",
  "ping.noReply": "No reply ({count} packets, 100% loss)",
  "ping.avg": "{ms} ms avg",
  "ping.loss": "{loss}% loss",
  "push.never": "No push received yet",
  "push.late": "No push for {s}s (allowed {allowed}s)",
  // Redfish / iLO
  "redfish.health": "Health {health}",
  "redfish.power": "power {power}",
  "redfish.poweredState": "{model} is powered {power}",
  "redfish.noSystems": "The BMC lists no systems",
  "redfish.health.OK": "OK",
  "redfish.health.Warning": "Warning",
  "redfish.health.Critical": "Critical",
  "redfish.power.On": "on",
  "redfish.power.Off": "off",
  "redfish.power.PoweringOn": "powering on",
  "redfish.power.PoweringOff": "powering off",
  // SMTP
  "cred.unreadable": "The shared credential cannot be read (was APP_SECRET changed?)",
  "temp.ok": "{sensor}: {value} °C",
  "temp.rising": "rising fast: +{rise} °C in {min} min",
  "temp.room.ok": "{room}: average {avg} °C over {total} sensors, warmest {max} °C ({where})",
  "temp.room.hot": "{room}: hot sensors {count} of {total}, warmest {max} °C ({where})",
  "temp.room.rising": "{room}: sensors rising fast {count} of {total}, warmest {max} °C ({where})",
  "temp.room.none": "No inlet temperature monitors tagged room:{room}",
  "temp.room.stale": "{room}: no recent readings from its {total} sensors",
  "temp.room.missing": "without recent readings: {count}",
  "temp.high": "{sensor}: {value} °C, at or above {limit} °C",
  "temp.noSensor": "No temperature sensor matching “{sensor}”",
  "temp.noThermal": "The BMC reports no temperatures",
  "temp.noReading": "Sensor {sensor} gives no reading (state: {state})",
  "ldap.answers": "Directory answers: {server}",
  "ldap.notSynchronized": "Domain controller {server} is not synchronized yet (initial replication)",
  "ldap.noRootDse": "The server answered without directory information",
  "ldap.signedIn": "Signed in as {account}",
  "ldap.found": "entries found: {count}",
  "ldap.tooFew": "Entries found: {count}; at least {min} expected",
  "ldap.searchFailed": "Search failed: {reason}",
  "ldap.starttls": "StartTLS failed: {reason}",
  "ldap.invalidCredentials": "Sign-in rejected: wrong account or password",
  "ldap.locked": "Sign-in rejected: the account is locked out",
  "ldap.passwordExpired": "Sign-in rejected: the password has expired",
  "ldap.mustChangePassword": "Sign-in rejected: the password must be changed",
  "ldap.disabled": "Sign-in rejected: the account is disabled",
  "ldap.accountExpired": "Sign-in rejected: the account has expired",
  "ldap.timeRestriction": "Sign-in rejected: not allowed at this time",
  "ldap.workstationRestriction": "Sign-in rejected: not allowed from this computer",
  "ldap.unwilling": "The server refused the sign-in: {reason}",
  "ldap.bindFailed": "Sign-in failed: {reason}",
  "smtp.timeout": "No complete SMTP response after {s}s (step: {step})",
  "smtp.greeting": "Unexpected greeting: {reply}",
  "smtp.ehlo": "EHLO rejected: {reply}",
  "smtp.noStarttls": "Server does not offer STARTTLS",
  "smtp.starttlsRefused": "STARTTLS refused: {reply}",
  // SNMP
  "snmp.noResponse": "No SNMP response (check host, community and ACLs)",
  "snmp.noResponseV3": "No SNMP response (check host, credentials and ACLs)",
  "snmp.oidError": "OID {oid}: {error}",
  "snmp.mismatch": "Got {value}, expected {op} {expected}",
  "snmp.notNumber": "OID {oid} is not a number: no rate",
  "trap.none": "No traps received yet",
  "trap.okLast": "No open traps (last: {trap} from {source})",
  "trap.open": "{trap} from {source}: {detail}",
  "trap.openFrom": "{trap} from {source}",
  "trap.repeated": "received {count} times",
  "trap.more": "{count} more open",
  "snmpif.traffic": "{name}: in {in}, out {out}",
  "snmpif.trafficPct": "{name}: in {in} ({inPct} %), out {out} ({outPct} %)",
  "snmpif.high": "utilisation {pct} %, at or above {limit} %",
  "snmpif.errors": "{rate} errors per minute (limit {limit})",
  "snmpif.linkDown": "{name}: link down ({state})",
  "snmpif.linkState": "{name}: link state {state}",
  "snmpif.adminDown": "{name}: disabled (administratively down)",
  "snmpif.notFound": "No interface “{name}” on this device (use Find interfaces)",
  "snmpif.ambiguous": "“{name}” matches {count} interfaces: use its name or index",
  // SSH
  "ssh.exitCode": "exit code {code}",
  "ssh.contains": "output contains \"{expected}\"",
  "ssh.notContains": "output does not contain \"{expected}\"",
  "ssh.matches": "output matches",
  "ssh.is": "output is \"{output}\"",
  "ssh.regexMatch": "output matches /{pattern}/",
  "ssh.regexNoMatch": "output does not match /{pattern}/",
  "ssh.unknown": "unknown check",
  "ssh.execFailed": "Could not run the command: {error}",
  "ssh.hostKey": "Host key does not match the pinned fingerprint (possible man-in-the-middle, or the server was reinstalled)",
  "ssh.auth": "Authentication failed (user, password or key)",
  // TLS certificate monitor
  "tls.none": "No certificate presented",
  "tls.expiredAgo": "Certificate for {subject} expired {days, plural, one {# day} other {# days}} ago",
  "tls.notTrusted": "Not trusted",
  "tls.daysLeft": "{days, plural, one {# day left} other {# days left}} ({date})",
  // vCenter
  "vcenter.http": "vCenter HTTP {status} for {path}",
  "vcenter.vmNotFound": "VM \"{vm}\" not found (or not visible to {user})",
  "vcenter.stateMismatch": "{vm} is {state}, expected {expected}",
  "vcenter.vmState": "{vm} {state}",
  "vcenter.toolsNeed7": "Tools check needs vCenter 7.0+",
  "vcenter.toolsState": "VMware Tools {state}",
  "vcenter.toolsRunning": "Tools running",
  "vcenter.toolsVersion": "Tools running ({status})",
  "vcenter.cpu": "{count} vCPU",
  "vcenter.memory": "{gib} GiB",
  "vcenter.sameName": "{count} VMs share this name, checked {id}",
  "vcenter.state.POWERED_ON": "powered on",
  "vcenter.state.POWERED_OFF": "powered off",
  "vcenter.state.SUSPENDED": "suspended",
};

/** Joins parts in English (stored as the plain `message`, used in logs and by API clients). */
export const englishMessage = (parts: MsgPart[]) => renderMessage(parts, () => undefined, "en");

/**
 * Renders parts with a translation lookup (code → template); unknown codes fall back to English.
 * Dates (params named `date`) are ISO dates and come out in the language's date format.
 */
export function renderMessage(parts: MsgPart[], lookup: (code: string) => string | undefined, lang: string, numberLocale = lang): string {
  const tpl = (code: string) => lookup(code) ?? MESSAGES[code] ?? code;
  return parts.map((p) => {
    if (typeof p === "string") return p;
    const [code, params] = p;
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params ?? {})) {
      if (typeof v === "string" && v.startsWith("@")) out[k] = tpl(v.slice(1));
      else if (k === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        try { out[k] = new Date(`${v}T00:00:00Z`).toLocaleDateString(numberLocale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }); } catch { out[k] = v; }
      } else out[k] = v;
    }
    return formatMessage(tpl(code), out, lang, numberLocale);
  }).join(" · ");
}

/** Cheap validation for parts arriving from the database. */
export const isMsgParts = (v: unknown): v is MsgPart[] =>
  Array.isArray(v) && v.every((p) => typeof p === "string" || (Array.isArray(p) && typeof p[0] === "string" && (p[1] === undefined || (typeof p[1] === "object" && p[1] !== null))));
