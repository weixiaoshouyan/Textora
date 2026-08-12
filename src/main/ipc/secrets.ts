/**
 * IPC 处理器：敏感信息加密存储（safeStorage）
 *
 * 安全措施：
 * 1. safeStorage 不可用时拒绝存储 secret（而非降级为明文），避免 API Key 泄漏
 * 2. 使用 atomicWrite 保证原子性，避免写入中断导致文件损坏
 * 3. 读 secret 时若 safeStorage 不可用但文件存在密文（之前曾可用），拒绝返回明文
 */
import { ipcMain, safeStorage } from 'electron';
import { readSecrets, getSecretFilePath, atomicWrite } from '../shared';

// 限定 key 字符集与长度，并拒绝原型链污染 key（__proto__/constructor/prototype
// 会把对象原型当成普通键读写，导致后续 JSON 序列化行为异常）
const SECRET_KEY_RE = /^[A-Za-z0-9._-]{1,128}$/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// secret 值大小上限（1 MiB）：防止恶意/失控调用写入超大值撑爆内存与磁盘
const MAX_SECRET_VALUE_LENGTH = 1024 * 1024;

// 写操作串行化：store/delete 都是 read-modify-write（读文件→改内存→原子写回），
// 并发执行会互相覆盖对方的修改（丢失更新）。用队列保证同一时刻只有一个写事务。
let writeQueue: Promise<void> = Promise.resolve();
function enqueueWrite(task: () => Promise<void>): Promise<void> {
  const run = writeQueue.then(task);
  // 前一个任务失败不阻塞后续任务
  writeQueue = run.catch(() => undefined);
  return run;
}

function validateSecretKey(key: unknown): string | null {
  if (typeof key !== 'string' || key.trim() === '') {
    return 'Secret key must be a non-empty string';
  }
  if (key.length > 128) {
    return 'Secret key is too long (max 128 chars)';
  }
  if (RESERVED_KEYS.has(key)) {
    return 'Secret key is reserved';
  }
  if (!SECRET_KEY_RE.test(key)) {
    return 'Secret key contains invalid characters';
  }
  return null;
}

export function registerSecretHandlers(): void {
  const secretFile = getSecretFilePath();

  ipcMain.handle('textora:store_secret', async (_evt, key: string, value: string): Promise<void> => {
    const keyError = validateSecretKey(key);
    if (keyError) throw new Error(keyError);
    if (typeof value !== 'string') {
      throw new Error('Secret value must be a string');
    }
    if (value.length > MAX_SECRET_VALUE_LENGTH) {
      throw new Error(`Secret value is too large (max ${MAX_SECRET_VALUE_LENGTH} chars)`);
    }
    // safeStorage 不可用时拒绝存储 secret，避免明文落盘
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage is not available; cannot store secret. Please unlock the system keyring.');
    }
    const encrypted = safeStorage.encryptString(value);
    await enqueueWrite(async () => {
      const data = readSecrets();
      data[key] = encrypted.toString('base64');
      await atomicWrite(secretFile, JSON.stringify(data));
    });
  });

  ipcMain.handle('textora:read_secret', async (_evt, key: string): Promise<string | null> => {
    const keyError = validateSecretKey(key);
    if (keyError) return null;
    const data = readSecrets();
    const raw = data[key];
    if (typeof raw !== 'string') return null;
    // 文件中是密文但当前 safeStorage 不可用（无法解密）→ 返回 null 而非泄漏明文
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(raw, 'base64'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('textora:delete_secret', async (_evt, key: string): Promise<void> => {
    const keyError = validateSecretKey(key);
    if (keyError) throw new Error(keyError);
    await enqueueWrite(async () => {
      const data = readSecrets();
      delete data[key];
      await atomicWrite(secretFile, JSON.stringify(data));
    });
  });
}
