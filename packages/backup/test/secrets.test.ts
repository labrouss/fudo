import { describe, expect, it } from "vitest";
import { decrypt, deriveKey, encrypt } from "@fudo/shared";
import { openRow, sealRow, PURPOSE } from "../src/secrets.js";

const A = "a".repeat(40), B = "b".repeat(40);
const enc = (s: string, secret: string, purpose: string) => encrypt(s, deriveKey(secret, purpose));

describe("backup secrets move between servers", () => {
  it("2FA keys: server A → backup (plain inside) → server B", () => {
    const row = { id: "u1", email: "a@x", totp_secret_enc: enc("JBSWY3DPEHPK3PXP", A, PURPOSE.totp) };
    const inBackup = openRow("users", row, A);
    expect(inBackup.totp_secret_enc).toEqual({ $secret: "JBSWY3DPEHPK3PXP", $purpose: PURPOSE.totp });
    const onB = sealRow(inBackup, B);
    expect(decrypt(onB.totp_secret_enc as string, deriveKey(B, PURPOSE.totp))).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decrypt(onB.totp_secret_enc as string, deriveKey(A, PURPOSE.totp))).toThrow();
  });
  it("monitor credentials inside the config keep their prefix and other fields", () => {
    const row = { id: "m1", type: "ssh", config: { host: "srv01", port: 22, password: "enc:v1:" + enc("S3cret!", A, PURPOSE.monitor) } };
    const onB = sealRow(openRow("monitors", row, A), B) as { config: Record<string, unknown> };
    expect(onB.config.host).toBe("srv01");
    expect(onB.config.port).toBe(22);
    const pw = onB.config.password as string;
    expect(pw.startsWith("enc:v1:")).toBe(true);
    expect(decrypt(pw.slice(7), deriveKey(B, PURPOSE.monitor))).toBe("S3cret!");
  });
  it("SMTP password in settings; other settings untouched", () => {
    const smtp = { key: "smtp", value: { host: "mail", passwordEnc: enc("relay-pw", A, PURPOSE.smtp) } };
    const onB = sealRow(openRow("settings", smtp, A), B) as { value: Record<string, string> };
    expect(decrypt(onB.value.passwordEnc!, deriveKey(B, PURPOSE.smtp))).toBe("relay-pw");
    expect(openRow("settings", { key: "org.name", value: "Acme" }, A)).toEqual({ key: "org.name", value: "Acme" });
  });
  it("shared credentials: the sealed secrets move to the new server's key", () => {
    const row = { id: "k1", name: "iLO read-only", kind: "password", fields: { username: "fudo-ro" }, secrets_enc: enc('{"password":"Ilo-Pass-1"}', A, PURPOSE.credential) };
    const inBackup = openRow("credentials", row, A);
    expect(inBackup.fields).toEqual({ username: "fudo-ro" });
    const onB = sealRow(inBackup, B);
    expect(JSON.parse(decrypt(onB.secrets_enc as string, deriveKey(B, "credential-secrets")))).toEqual({ password: "Ilo-Pass-1" });
  });
  it("channel configs", () => {
    const row = { id: "c1", config_enc: enc('{"url":"https://hooks/x"}', A, PURPOSE.channel) };
    const onB = sealRow(openRow("notification_channels", row, A), B);
    expect(decrypt(onB.config_enc as string, deriveKey(B, PURPOSE.channel))).toBe('{"url":"https://hooks/x"}');
  });
  it("profile secrets: contact targets, a pending 2FA device and the Telegram bot token", () => {
    const contact = { id: "k1", user_id: "u1", type: "teams", target_enc: enc("https://prod-1.logic.azure.com/workflows/x?sig=s3cr3t", A, PURPOSE.contact) };
    const onB = sealRow(openRow("user_contact_methods", contact, A), B);
    expect(decrypt(onB.target_enc as string, deriveKey(B, PURPOSE.contact))).toBe("https://prod-1.logic.azure.com/workflows/x?sig=s3cr3t");
    const user = { id: "u1", totp_secret_enc: enc("OLDSECRET", A, PURPOSE.totp), pending_totp_secret_enc: enc("NEWSECRET", A, PURPOSE.totp) };
    const u2 = sealRow(openRow("users", user, A), B);
    expect(decrypt(u2.pending_totp_secret_enc as string, deriveKey(B, PURPOSE.totp))).toBe("NEWSECRET");
    const tg = { key: "telegram", value: { botTokenEnc: enc("123:abc", A, PURPOSE.telegram), botName: "acme_bot" } };
    const t2 = sealRow(openRow("settings", tg, A), B) as { value: Record<string, string> };
    expect(decrypt(t2.value.botTokenEnc!, deriveKey(B, PURPOSE.telegram))).toBe("123:abc");
    expect(t2.value.botName).toBe("acme_bot");
  });
  it("a wrong APP_SECRET is reported, not ignored", () => {
    const row = { id: "u2", totp_secret_enc: enc("X", A, PURPOSE.totp) };
    expect(() => openRow("users", row, B)).toThrow(/APP_SECRET/);
  });
});
