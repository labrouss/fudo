import type { Runner, RunContext, CheckResult } from "./runners/types.js";
import { httpRunner } from "./runners/http.js";
import { pingRunner } from "./runners/ping.js";
import { tcpRunner } from "./runners/tcp.js";
import { dnsRunner } from "./runners/dns.js";
import { tlsRunner } from "./runners/tls.js";
import { pushRunner } from "./runners/push.js";
import { snmpRunner } from "./runners/snmp.js";
import { snmpInterfaceRunner } from "./runners/snmp-interface.js";
import { snmpTrapRunner } from "./runners/snmp-trap.js";
import { ntpRunner } from "./runners/ntp.js";
import { smtpRunner } from "./runners/smtp.js";
import { domainRunner } from "./runners/domain.js";
import { mongodbRunner, mysqlRunner, postgresRunner, redisRunner, sqlserverRunner } from "./runners/db.js";
import { sshRunner } from "./runners/ssh.js";
import { dockerRunner } from "./runners/docker.js";
import { vcenterVmRunner } from "./runners/vcenter.js";
import { redfishRunner } from "./runners/redfish.js";
import { ldapRunner } from "./runners/ldap.js";
import { temperatureRunner } from "./runners/temperature.js";
import { roomRunner } from "./runners/room.js";

export type { CheckResult, RunContext } from "./runners/types.js";
export { statusAccepted, jsonPathGet, parseHeaders } from "./runners/http.js";
export { listInterfaces, type FoundInterface } from "./runners/snmp-interface.js";
export { SnmpError } from "./runners/snmp-session.js";

const RUNNERS: Record<string, Runner> = {
  http: httpRunner, ping: pingRunner, tcp: tcpRunner, dns: dnsRunner, tls: tlsRunner, push: pushRunner,
  snmp: snmpRunner, "snmp-interface": snmpInterfaceRunner, "snmp-trap": snmpTrapRunner, ntp: ntpRunner, smtp: smtpRunner, ldap: ldapRunner, domain: domainRunner,
  mysql: mysqlRunner, postgres: postgresRunner, sqlserver: sqlserverRunner, redis: redisRunner, mongodb: mongodbRunner,
  ssh: sshRunner, docker: dockerRunner, "vcenter-vm": vcenterVmRunner, redfish: redfishRunner, "redfish-temperature": temperatureRunner, "temperature-room": roomRunner,
};

/** Runs one check with a hard upper time limit, so a misbehaving runner can never stall the scheduler. */
export async function runCheck(type: string, cfg: Record<string, unknown>, ctx: RunContext): Promise<CheckResult | null> {
  const runner = RUNNERS[type];
  if (!runner) return { status: "DOWN", latencyMs: null, message: `Unknown monitor type "${type}"` };
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<CheckResult>((resolve) => {
    timer = setTimeout(() => resolve({ status: "DOWN", latencyMs: null, message: `Timed out after ${ctx.timeoutMs / 1000}s` }), ctx.timeoutMs + 3000);
  });
  try {
    return await Promise.race([runner(cfg, ctx).catch((err: Error) => ({ status: "DOWN" as const, latencyMs: null, message: err.message })), guard]);
  } finally {
    clearTimeout(timer);
  }
}
