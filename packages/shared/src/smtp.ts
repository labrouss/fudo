/**
 * Explains an SMTP failure in words an administrator can act on (nodemailer / Node TLS error codes).
 */
export function smtpErrorMessage(err: unknown, server?: { host: string; port: number }): string {
  const e = err as { code?: string; responseCode?: number; message?: string; reason?: string };
  const msg = String(e?.message ?? err);
  const at = server ? ` (${server.host}:${server.port})` : "";
  const certCodes = ["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"];
  if ((e?.code && certCodes.includes(e.code)) || /self[- ]signed|certificate/i.test(msg)) {
    return `The SMTP server's certificate is not trusted${at}: ${msg}. For a local server with a self-signed certificate, enable "Accept self-signed certificates" in the email settings.`;
  }
  if (e?.code === "EAUTH" || e?.responseCode === 535) return `The SMTP server rejected the user name or password${at}.`;
  if (e?.code === "ESOCKET" && /wrong version number|ssl3_get_record/i.test(msg)) return `TLS handshake failed${at}: the port probably expects STARTTLS; turn off "Use TLS from the start" (typical for port 25/587).`;
  if (["ECONNREFUSED", "ETIMEDOUT", "ECONNECTION", "EDNS", "ENOTFOUND"].includes(e?.code ?? "") || /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(msg)) return `Cannot connect to the SMTP server${at}: ${msg}`;
  if (e?.code === "EENVELOPE" || (e?.responseCode && e.responseCode >= 500)) return `The SMTP server rejected the message${at}: ${msg}`;
  return `Sending failed${at}: ${msg}`;
}
