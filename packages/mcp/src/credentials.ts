import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

let masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (masterKey) return masterKey;

  const keyEnv = process.env['PHOENIX_MCP_KEY'];
  if (keyEnv) {
    masterKey = Buffer.from(keyEnv, 'hex');
    if (masterKey.length !== KEY_LENGTH) {
      masterKey = scryptSync(keyEnv, 'phoenix-mcp-salt', KEY_LENGTH);
    }
  } else {
    masterKey = randomBytes(KEY_LENGTH);
  }

  return masterKey;
}

function getStorePath(): string {
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '/tmp';
  return join(home, '.phoenix', 'mcp', 'credentials');
}

interface StoredCredential {
  iv: string;
  tag: string;
  data: string;
  salt: string;
}

export async function storeCredential(
  serverId: string,
  credential: Record<string, string>
): Promise<void> {
  const key = getMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = scryptSync(key, salt, KEY_LENGTH);

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

  const plaintext = JSON.stringify(credential);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const stored: StoredCredential = {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
    salt: salt.toString('hex'),
  };

  const storeDir = getStorePath();
  await mkdir(storeDir, { recursive: true });
  const filePath = join(storeDir, `${serverId}.json`);
  await writeFile(filePath, JSON.stringify(stored, null, 2), 'utf-8');
}

export async function getCredential(
  serverId: string
): Promise<Record<string, string> | null> {
  try {
    const storeDir = getStorePath();
    const filePath = join(storeDir, `${serverId}.json`);
    const raw = await readFile(filePath, 'utf-8');
    const stored: StoredCredential = JSON.parse(raw);

    const key = getMasterKey();
    const salt = Buffer.from(stored.salt, 'hex');
    const derivedKey = scryptSync(key, salt, KEY_LENGTH);

    const iv = Buffer.from(stored.iv, 'hex');
    const tag = Buffer.from(stored.tag, 'hex');
    const encrypted = Buffer.from(stored.data, 'hex');

    const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
  } catch {
    return null;
  }
}

export async function deleteCredential(serverId: string): Promise<void> {
  try {
    const storeDir = getStorePath();
    const filePath = join(storeDir, `${serverId}.json`);
    const { unlink: unlinkFile } = await import('fs/promises');
    await unlinkFile(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function hasCredential(serverId: string): Promise<boolean> {
  try {
    const storeDir = getStorePath();
    const filePath = join(storeDir, `${serverId}.json`);
    await readFile(filePath, 'utf-8');
    return true;
  } catch {
    return false;
  }
}
