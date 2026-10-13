import { and, eq, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { schema, type Db } from "@fudo/db";
import {
  decrypt, deriveKey, encrypt, generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode,
  otpauthUri, sha256, verifyTotp, type Env, type TotpEnrollment,
} from "@fudo/shared";

export class TotpService {
  private key: Buffer;
  constructor(private db: Db, env: Env) {
    this.key = deriveKey(env.APP_SECRET, "totp-secret");
  }

  newEncryptedSecret(): string {
    return encrypt(generateTotpSecret(), this.key);
  }

  async enrollment(user: { email: string; totpSecretEnc: string | null }, issuer: string): Promise<TotpEnrollment> {
    if (!user.totpSecretEnc) throw new Error("User has no TOTP secret");
    const secret = decrypt(user.totpSecretEnc, this.key);
    const uri = otpauthUri(secret, user.email, issuer);
    const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return { secret, otpauthUri: uri, qrDataUrl };
  }

  /** Verifies a code and records the step to block replay. */
  async verifyAndConsume(user: { id: string; totpSecretEnc: string | null; totpLastStep: number | null }, code: string): Promise<boolean> {
    if (!user.totpSecretEnc) return false;
    const step = verifyTotp(decrypt(user.totpSecretEnc, this.key), code, { lastUsedStep: user.totpLastStep });
    if (step === null) return false;
    await this.db.update(schema.users).set({ totpLastStep: step }).where(eq(schema.users.id, user.id));
    return true;
  }

  /** Replaces all recovery codes; returns the plain codes (shown once). */
  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateRecoveryCodes(10);
    await this.db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId));
    await this.db.insert(schema.recoveryCodes).values(
      codes.map((c) => ({ userId, codeHash: sha256(normalizeRecoveryCode(c)) })),
    );
    return codes;
  }

  async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const hash = sha256(normalizeRecoveryCode(code));
    const updated = await this.db
      .update(schema.recoveryCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.recoveryCodes.userId, userId), eq(schema.recoveryCodes.codeHash, hash), isNull(schema.recoveryCodes.usedAt)))
      .returning({ id: schema.recoveryCodes.id });
    return updated.length > 0;
  }
}
