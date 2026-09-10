/**
 * 密钥加解密接口。生产实现见 safeStorageBox.ts（依赖 Electron），
 * 这里只放纯逻辑，保证单元测试不必加载 electron。
 */
export interface SecretBox {
  encrypt(plain: string): string
  decrypt(cipher: string): string
}

/**
 * 仅用于测试与降级。用固定前缀 + base64，明确不是安全加密。
 */
export function createMemoryBox(): SecretBox {
  return {
    encrypt: (plain) => 'plain64:' + Buffer.from(plain, 'utf8').toString('base64'),
    decrypt: (cipher) => {
      if (!cipher.startsWith('plain64:')) throw new Error('不是本实现产生的密文')
      return Buffer.from(cipher.slice('plain64:'.length), 'base64').toString('utf8')
    }
  }
}