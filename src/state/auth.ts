import { shallowRef, ref } from 'vue'
import { authApi, ApiError } from '../api/auth'
import type { Session } from '../api/auth'

export function createAuth(api = authApi) {
  const session = shallowRef<Session | null>(null)
  const initialized = ref(false)
  const message = ref('')
  let epoch = 0
  let pending: Promise<void> | undefined
  async function refresh() {
    if (pending) return pending
    const started = epoch
    pending = (async () => {
      try {
        const result = await api.me()
        if (started === epoch) { session.value = result; message.value = '' }
      } catch (error) {
        if (started !== epoch) return
        if (error instanceof ApiError && error.status === 401) {
          if (session.value) message.value = error.message
          session.value = null
        } else {
          message.value = error instanceof Error ? error.message : '服务暂不可用'
          throw error
        }
      } finally { if (started === epoch) initialized.value = true }
    })().finally(() => { pending = undefined })
    return pending
  }
  async function login(mobile: string, code: string) {
    const started = ++epoch
    const result = await api.login(mobile, code)
    if (started !== epoch) return
    session.value = result; initialized.value = true; message.value = ''
  }
  async function logout() {
    ++epoch
    try { await api.logout() }
    catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error }
    session.value = null; initialized.value = true; message.value = ''
  }
  return { session, initialized, message, refresh, login, logout }
}
export const auth = createAuth()
