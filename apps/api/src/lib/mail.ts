import nodemailer from "nodemailer";
import { decrypt, deriveKey, type Env } from "@fudo/shared";
import type { StoredSmtp } from "./settings.js";

export const smtpKey = (env: Env) => deriveKey(env.APP_SECRET, "smtp-password");

export async function sendMail(env: Env, smtp: StoredSmtp, msg: { to: string; subject: string; text: string }) {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.username ? { user: smtp.username, pass: smtp.passwordEnc ? decrypt(smtp.passwordEnc, smtpKey(env)) : "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    tls: { rejectUnauthorized: !smtp.allowUntrusted },
  });
  await transport.sendMail({ from: smtp.from, ...msg });
}
