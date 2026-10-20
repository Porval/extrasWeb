import { request, ApiError } from './http'
export { ApiError } from './http'
export interface Account {
  id: string
  providerName: string
  personName: string
  mobile: string
  role: 'admin' | 'member'
  enabled: boolean
}
export interface Session { account: Account; expiresAt: number }
export interface CodeResponse { message: string; retryAfter: number; devCode?: string }
function sessionValue(data: unknown): Session {
  const value = data as Partial<Session> | null
  const account = value?.account
  if (!account || !['id', 'providerName', 'personName', 'mobile'].every((field) => typeof account[field as keyof Account] === 'string') ||
    !['admin', 'member'].includes(account.role) || account.enabled !== true || typeof value?.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) {
    throw new ApiError(502, '账户信息异常，请重新登录。')
  }
  return value as Session
}
export const authApi = {
  async config(): Promise<{ developmentSms: boolean }> {
    const data = await request('/api/config') as { developmentSms?: unknown } | null
    return { developmentSms: data?.developmentSms === true }
  },
  async requestCode(mobile: string): Promise<CodeResponse> {
    const data = await request('/api/auth/code', { mobile }) as Partial<CodeResponse> | null
    if (!data || typeof data.message !== 'string' || typeof data.retryAfter !== 'number' || !Number.isFinite(data.retryAfter) || data.retryAfter < 0) {
      throw new ApiError(502, '发送结果异常，请稍后重试。')
    }
    return { message: data.message, retryAfter: Math.ceil(data.retryAfter), ...(typeof data.devCode === 'string' ? { devCode: data.devCode } : {}) }
  },
  async login(mobile: string, code: string) { return sessionValue(await request('/api/auth/login', { mobile, code })) },
  async me() { return sessionValue(await request('/api/auth/me')) },
  async logout() { await request('/api/auth/logout', {}) },
}
