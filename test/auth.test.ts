import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi, ApiError } from '../src/api/auth'
import type { Session } from '../src/api/auth'
import { createAuth } from '../src/state/auth'
const session: Session = { account: { id: 'qa-account', providerName: '测试服务商', personName: '测试人员', mobile: '13800138000', role: 'member', enabled: true }, expiresAt: Date.now() + 604800000 }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => vi.unstubAllGlobals())
describe('Cookie 登录接口', () => {
  it('发送手机号与验证码并使用同源 Cookie，不存储 token', async () => {
    const fetch = vi.fn().mockResolvedValue(json(session)); vi.stubGlobal('fetch', fetch)
    expect(await authApi.login('13800138000', '123456')).toEqual(session)
    const [path, options] = fetch.mock.calls[0]!
    expect(path).toBe('/api/auth/login'); expect(options.credentials).toBe('same-origin')
    expect(JSON.parse(options.body)).toEqual({ mobile: '13800138000', code: '123456' })
    expect(options.headers.Authorization).toBeUndefined()
  })
  it('透传验证码错误及限流提示，不把 HTTP 错误当成成功', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: '验证码无效或已过期' }, 401)).mockResolvedValueOnce(json({ error: '请等待 60 秒' }, 429)))
    await expect(authApi.login('13800138000', '000000')).rejects.toMatchObject({ status: 401, message: '验证码无效或已过期' })
    await expect(authApi.requestCode('13800138000')).rejects.toMatchObject({ status: 429 })
  })
  it('网络故障与错误的成功响应不能进入账户页', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(json({ success: true })))
    await expect(authApi.me()).rejects.toMatchObject({ status: 0 })
    await expect(authApi.login('13800138000', '123456')).rejects.toMatchObject({ status: 502 })
  })
})
describe('登录会话状态', () => {
  it('刷新恢复会话；后端401立即清除旧会话，保留失效原因', async () => {
    const me = vi.fn().mockResolvedValueOnce(session).mockRejectedValueOnce(new ApiError(401, '已在其他设备登录'))
    const state = createAuth({ ...authApi, me }); await state.refresh()
    expect(state.session.value).toEqual(session); await state.refresh()
    expect(state.session.value).toBeNull(); expect(state.message.value).toBe('已在其他设备登录')
  })
  it('后台检查网络失败不会错误清除已登录会话', async () => {
    const me = vi.fn().mockResolvedValueOnce(session).mockRejectedValueOnce(new ApiError(0, '连接失败'))
    const state = createAuth({ ...authApi, me }); await state.refresh()
    await expect(state.refresh()).rejects.toThrow('连接失败'); expect(state.session.value).toEqual(session)
  })
  it('登录前发出的旧会话检查响应不会覆盖新登录结果', async () => {
    let fail: (reason: unknown) => void = () => {}
    const me = vi.fn(() => new Promise<Session>((_, reject) => { fail = reject }))
    const state = createAuth({ ...authApi, me, login: vi.fn().mockResolvedValue(session) })
    const refresh = state.refresh(); await state.login('13800138000', '123456')
    fail(new ApiError(401, '旧请求未登录')); await refresh
    expect(state.session.value).toEqual(session); expect(state.message.value).toBe('')
  })
  it('退出失败保留会话，重试成功后才清除；已失效401也能正常退出', async () => {
    const logout = vi.fn().mockRejectedValueOnce(new ApiError(0, '网络故障')).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiError(401, '已失效'))
    const state = createAuth({ ...authApi, login: vi.fn().mockResolvedValue(session), logout })
    await state.login('13800138000', '123456')
    await expect(state.logout()).rejects.toThrow('网络故障'); expect(state.session.value).toEqual(session)
    await state.logout(); expect(state.session.value).toBeNull()
    await state.login('13800138000', '123456'); await state.logout(); expect(state.session.value).toBeNull()
  })
})
