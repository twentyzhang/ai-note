// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsView from '../../src/renderer/src/views/SettingsView'
import type { AiProfile, AppConfig } from '../../src/shared/types'

const mocks = vi.hoisted(() => {
  const g = globalThis as unknown as { window?: Record<string, unknown> }
  if (!g.window) g.window = {}
  const target = {
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    listProfiles: vi.fn(),
    saveProfile: vi.fn(),
    deleteProfile: vi.fn(),
    setApiKey: vi.fn(),
    testConnection: vi.fn(),
    startTranslation: vi.fn(),
    cancelTranslation: vi.fn(),
    readTranslation: vi.fn(),
    translateSelection: vi.fn(),
    onTranslationProgress: vi.fn(() => () => {})
  }
  g.window.api = target
  return target
})

const { getConfig, listProfiles, saveProfile, testConnection } = mocks

const profile: AiProfile = {
  id: 'p1',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  concurrency: 3,
  maxBatchBlocks: 10,
  maxBatchChars: 6000,
  pricePerMTokIn: 1,
  pricePerMTokOut: 2
}

const config: AppConfig = {
  version: 1,
  libraryRoot: 'C:/papers',
  activeProfileId: 'p1',
  targetLang: 'zh'
}

beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = mocks
  getConfig.mockResolvedValue(config)
  listProfiles.mockResolvedValue([profile])
})

describe('设置页', () => {
  it('加载后显示已有的 AI 配置', async () => {
    render(<SettingsView onBack={() => {}} />)
    expect(await screen.findByDisplayValue('DeepSeek')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('deepseek-chat')).toBeInTheDocument()
  })

  it('保存时把改动写回去', async () => {
    saveProfile.mockResolvedValue(undefined)
    render(<SettingsView onBack={() => {}} />)
    const modelInput = await screen.findByDisplayValue('deepseek-chat')
    fireEvent.change(modelInput, { target: { value: 'deepseek-reasoner' } })

    fireEvent.click(await screen.findByRole('button', { name: /保存/ }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalled())
    const saved = saveProfile.mock.calls[0][0] as AiProfile
    expect(saved.model).toBe('deepseek-reasoner')
  })

  it('可以填写单价，保存时一并带上', async () => {
    saveProfile.mockResolvedValue(undefined)
    render(<SettingsView onBack={() => {}} />)
    const inputPrice = await screen.findByLabelText(/输入单价/)
    fireEvent.change(inputPrice, { target: { value: '2' } })
    fireEvent.click(await screen.findByRole('button', { name: /保存/ }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalled())
    expect((saveProfile.mock.calls[0][0] as AiProfile).pricePerMTokIn).toBe(2)
  })

  it('单价留空表示未知，不会变成 0', async () => {
    saveProfile.mockResolvedValue(undefined)
    render(<SettingsView onBack={() => {}} />)
    const outputPrice = await screen.findByLabelText(/输出单价/)
    fireEvent.change(outputPrice, { target: { value: '' } })
    fireEvent.click(await screen.findByRole('button', { name: /保存/ }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalled())
    expect((saveProfile.mock.calls[0][0] as AiProfile).pricePerMTokOut).toBeNull()
  })

  it('测试连接成功时给出中文成功提示', async () => {
    testConnection.mockResolvedValue({ ok: true, message: '连接成功，模型可用' })
    render(<SettingsView onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /测试连接/ }))
    expect(await screen.findByText(/连接成功/)).toBeInTheDocument()
  })

  it('测试连接失败时显示原因', async () => {
    testConnection.mockResolvedValue({ ok: false, message: 'API Key 无效或没有权限' })
    render(<SettingsView onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /测试连接/ }))
    expect(await screen.findByText(/API Key 无效/)).toBeInTheDocument()
  })

  it('可以填密钥，输入框类型是密码', async () => {
    render(<SettingsView onBack={() => {}} />)
    const keyInput = await screen.findByLabelText(/API Key/)
    expect(keyInput.getAttribute('type')).toBe('password')
  })
})