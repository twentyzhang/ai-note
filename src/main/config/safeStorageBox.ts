import { safeStorage } from 'electron'
import { createMemoryBox, type SecretBox } from './secrets'

/**
 * 生产实现：用操作系统提供的加密能力（Windows 上是 DPAPI）。
 * safeStorage 不可用时退回内存实现，保证功能不中断——但此时密钥只是编码而非加密，
 * 设置页会据此给出提示。
 */
export function createSafeStorageBox(): SecretBox {
  if (!safeStorage.isEncryptionAvailable()) return createMemoryBox()
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64'))
  }
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}