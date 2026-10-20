import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { authApi, ApiError } from '../src/api/auth'
import { auth } from '../src/state/auth'
import LoginView from '../src/views/LoginView.vue'
const { replace } = vi.hoisted(() => ({ replace: vi.fn().mockResolvedValue(undefined) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
beforeEach(() => {
  sessionStorage.clear(); auth.session.value = null; auth.message.value = ''; auth.initialized.value = true
  vi.spyOn(authApi, 'config').mockResolvedValue({ developmentSms: false }); replace.mockClear()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it('无效手机号和验证码在本地拦截，不请求短信服务', async () => {
  const send = vi.spyOn(authApi, 'requestCode'); const login = vi.spyOn(auth, 'login')
  const wrapper = mount(LoginView); await flushPromises()
  await wrapper.find('.code-button').trigger('click'); expect(wrapper.text()).toContain('请输入有效的 11 位手机号')
  await wrapper.find('#mobile').setValue('13800138000'); await wrapper.find('form').trigger('submit')
  expect(wrapper.text()).toContain('请输入 6 位短信验证码'); expect(send).not.toHaveBeenCalled(); expect(login).not.toHaveBeenCalled(); wrapper.unmount()
})
it('发送成功倒计时禁用重发，切换手机号清除验证码，真实模式不显示返回的调试码', async () => {
  vi.useFakeTimers(); vi.spyOn(authApi, 'requestCode').mockResolvedValue({ message: '验证码已发送', retryAfter: 60, devCode: '123456' })
  const wrapper = mount(LoginView); await flushPromises(); await wrapper.find('#mobile').setValue('13800138000')
  await wrapper.find('.code-button').trigger('click'); await flushPromises()
  expect(wrapper.find('.code-button').attributes('disabled')).toBeDefined(); expect(wrapper.text()).toContain('60 秒后重试')
  expect(wrapper.text()).not.toContain('123456'); expect(wrapper.find('.development-note').exists()).toBe(false)
  await wrapper.find('#code').setValue('654321'); await wrapper.find('#mobile').setValue('13900139000')
  expect((wrapper.find('#code').element as HTMLInputElement).value).toBe('')
  vi.advanceTimersByTime(61000); await wrapper.vm.$nextTick(); expect(wrapper.find('.code-button').attributes('disabled')).toBeUndefined(); wrapper.unmount()
})
it('错误验证码停留登录页；成功登录后进入工作空间', async () => {
  vi.spyOn(auth, 'login').mockRejectedValueOnce(new ApiError(401, '验证码无效或已过期')).mockResolvedValueOnce(undefined)
  const wrapper = mount(LoginView); await flushPromises(); await wrapper.find('#mobile').setValue('13800138000'); await wrapper.find('#code').setValue('123456')
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('验证码无效或已过期'); expect(replace).not.toHaveBeenCalled()
  await wrapper.find('form').trigger('submit'); await flushPromises(); expect(replace).toHaveBeenCalledWith({ name: 'orders' })
  expect((wrapper.find('#code').element as HTMLInputElement).value).toBe(''); wrapper.unmount()
})
