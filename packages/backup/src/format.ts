/**
 * The .fudobackup file:
 *
 *   FUDOBACKUP1\n
 *   <header JSON>\n                       readable without the passphrase: version, date, contents
 *   <u32 length><iv 12><tag 16><manifest>  encrypted JSON: organization, row counts (checks the passphrase)
 *   <iv 12><data …><tag 16>                encrypted, gzip-compressed table sections
 *
 * AES-256-GCM with a key derived from the passphrase by scrypt (salt in the header). The data
 * tag is verified when the stream ends; a restore only commits after that, so a damaged or
 * altered file changes nothing.
 */
import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb, type CipherGCM, type DecipherGCM } from "node:crypto";
import { open } from "node:fs/promises";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
export const MAGIC = "FUDOBACKUP1\n";
export const EXTENSION = ".fudobackup";
const KDF = { N: 1 << 16, r: 8, p: 1 };

export type BackupKind = "manual" | "auto" | "prerestore" | "uploaded";
export interface BackupHeader {
  format: 1;
  fudoVersion: string;
  /** last applied migration, e.g. "0016" */
  schema: string;
  createdAt: string;
  /** raw check results included */
  history: boolean;
  kind: BackupKind;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
}
export interface BackupManifest { organization: string | null; counts: Record<string, number> }

export class BackupError extends Error {
  constructor(public code: "not_a_backup" | "wrong_passphrase" | "damaged" | "newer_version" | "unsupported", message: string) { super(message); }
}

export async function deriveBackupKey(passphrase: string, salt: Buffer, kdf = KDF): Promise<Buffer> {
  return scrypt(passphrase, salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 });
}

export async function newHeader(h: Omit<BackupHeader, "format" | "kdf" | "createdAt">, passphrase: string): Promise<{ header: BackupHeader; key: Buffer }> {
  const salt = randomBytes(16);
  const header: BackupHeader = { format: 1, ...h, createdAt: new Date().toISOString(), kdf: { name: "scrypt", ...KDF, salt: salt.toString("base64") } };
  return { header, key: await deriveBackupKey(passphrase, salt) };
}

/** The bytes before the data section. */
export function encodePreamble(header: BackupHeader, manifest: BackupManifest, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(manifest), "utf8"), c.final()]);
  const block = Buffer.concat([iv, c.getAuthTag(), ct]);
  const len = Buffer.alloc(4); len.writeUInt32BE(block.length);
  return Buffer.concat([Buffer.from(MAGIC + JSON.stringify(header) + "\n", "utf8"), len, block]);
}

/** A cipher for the data section; write its iv first, its auth tag last. */
export function dataCipher(key: Buffer): { iv: Buffer; cipher: CipherGCM } {
  const iv = randomBytes(12);
  return { iv, cipher: createCipheriv("aes-256-gcm", key, iv) };
}

export interface OpenedBackup { header: BackupHeader; dataStart: number; dataEnd: number; size: number; readManifest: (passphrase: string) => Promise<{ manifest: BackupManifest; key: Buffer }> }

/** Reads the readable part of a backup file (no passphrase needed). */
export async function openBackup(file: string): Promise<OpenedBackup> {
  const fh = await open(file, "r");
  try {
    const { size } = await fh.stat();
    const head = Buffer.alloc(Math.min(size, 64 * 1024));
    await fh.read(head, 0, head.length, 0);
    if (head.subarray(0, MAGIC.length).toString("utf8") !== MAGIC) throw new BackupError("not_a_backup", "This file is not a Fudo backup.");
    const nl = head.indexOf(10, MAGIC.length);
    if (nl < 0) throw new BackupError("damaged", "The backup file is damaged.");
    let header: BackupHeader;
    try { header = JSON.parse(head.subarray(MAGIC.length, nl).toString("utf8")); } catch { throw new BackupError("damaged", "The backup file is damaged."); }
    if (header.format !== 1 || header.kdf?.name !== "scrypt") throw new BackupError("unsupported", "This backup was made by a newer Fudo version.");
    const lenAt = nl + 1;
    if (size < lenAt + 4) throw new BackupError("damaged", "The backup file is damaged.");
    const manifestLen = head.length >= lenAt + 4 ? head.readUInt32BE(lenAt) : 0;
    const manifestBlock = Buffer.alloc(manifestLen);
    await fh.read(manifestBlock, 0, manifestLen, lenAt + 4);
    const dataStart = lenAt + 4 + manifestLen;
    if (size < dataStart + 12 + 16) throw new BackupError("damaged", "The backup file is damaged.");
    return {
      header, dataStart, dataEnd: size, size,
      readManifest: async (passphrase) => {
        const key = await deriveBackupKey(passphrase, Buffer.from(header.kdf.salt, "base64"), header.kdf);
        try {
          const d = createDecipheriv("aes-256-gcm", key, manifestBlock.subarray(0, 12));
          d.setAuthTag(manifestBlock.subarray(12, 28));
          const json = Buffer.concat([d.update(manifestBlock.subarray(28)), d.final()]).toString("utf8");
          return { manifest: JSON.parse(json) as BackupManifest, key };
        } catch {
          throw new BackupError("wrong_passphrase", "The passphrase is not correct for this backup.");
        }
      },
    };
  } finally {
    await fh.close();
  }
}

/** A decipher for the data section (reads iv and tag from the file positions). */
export async function dataDecipher(file: string, b: OpenedBackup, key: Buffer): Promise<DecipherGCM> {
  const fh = await open(file, "r");
  try {
    const iv = Buffer.alloc(12), tag = Buffer.alloc(16);
    await fh.read(iv, 0, 12, b.dataStart);
    await fh.read(tag, 0, 16, b.dataEnd - 16);
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return d;
  } finally {
    await fh.close();
  }
}

/** "0016_report_language.sql" → "0016" */
export const schemaOf = (migration: string) => migration.slice(0, 4);
