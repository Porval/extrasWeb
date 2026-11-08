import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OrderDetailView from '../src/views/OrderDetailView.vue'
import { auth } from '../src/state/auth'
import type { OrderRefund, TimelyOrder } from '../src/domain/orders'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'order' } }),
  useRouter: () => ({ replace: vi.fn() }),
}))

const order: TimelyOrder = {
  id: 'order', ownerId: 'member', referenceId: '', createdAt: 1700000000000,
  providerName: '渠道', operatorName: '服务商', platformName: '平台', cityName: '上海', brandName: '品牌',
  cityId: 'city', brandId: 'brand', plateId: 'plate', contacts: '测试地址', messages: '',
  arrivedTime: 30, payPrice: 1234, items: [], events: [],
  payment: { status: 'paid' }, review: { status: 'approved' },
  external: { status: 'created', timelyOrderId: 'fulfillment-order' }, fulfillment: { status: 'waiting' },
}
const refund: OrderRefund = { id: 'refund', status: 'requested', reason: '订单需要取消', requestedAt: 1700000000001 }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const fetcher = vi.fn<typeof fetch>()
let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockReset()
  auth.session.value = {
    account: { id: 'member', providerName: '渠道', personName: '服务商', mobile: '13800138000', role: 'member', enabled: true },
    expiresAt: Date.now() + 60000,
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function detail() {
  wrapper = mount(OrderDetailView, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
  return wrapper
}

it.each([false, undefined])('退款资格未显式开启时不展示申请入口（%s）', async canRequestRefund => {
  fetcher.mockResolvedValueOnce(response({ order, canRequestRefund }))
  const view = await detail()
  expect(view.find('.refund-card').exists()).toBe(false)
})

it('提交中拦截重复请求，失败保留原因，同内容重试复用幂等键', async () => {
  let finish!: (result: Response) => void
  fetcher.mockResolvedValueOnce(response({ order, canRequestRefund: true }))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce(response({ order: { ...order, refund } }, 201))
  const view = await detail()
  await view.get('.refund-card header button').trigger('click')
  const form = view.get('.refund-request-form')
  await form.trigger('submit')
  expect(view.get('.refund-card [role="alert"]').text()).toContain('请填写')
  await form.get('textarea').setValue('  订单需要取消  ')
  await form.trigger('submit')
  expect(form.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  await form.trigger('submit')
  expect(fetcher).toHaveBeenCalledTimes(2)
  const [url, options] = fetcher.mock.calls[1]!
  expect(url).toBe('/api/orders/order/refund-request')
  expect(options).toMatchObject({ method: 'POST', body: JSON.stringify({ reason: refund.reason }), headers: { 'Idempotency-Key': expect.any(String) } })

  finish(response({ error: '提交超时，请重试。' }, 503))
  await flushPromises()
  expect(view.get('.refund-card [role="alert"]').text()).toContain('请重试')
  expect((form.get('textarea').element as HTMLTextAreaElement).value.trim()).toBe(refund.reason)

  await form.trigger('submit')
  await flushPromises()
  expect(fetcher.mock.calls[2]).toEqual([url, expect.objectContaining({ body: options!.body, headers: options!.headers })])
  expect(view.get('.refund-card [role="status"]').text()).toBe('退款待处理')
  expect(view.get('.refund-card').text()).toContain(refund.reason)
  expect(view.find('.refund-request-form').exists()).toBe(false)
  expect(view.get('.order-state-pill').text()).toBe('待接单')
})

it('轮询区分履约侧退款、履约确认及款项退款发起进度', async () => {
  const refundedFulfillment = { ...order, fulfillment: { status: 'waiting', sourceCode: 6 } }
  fetcher.mockResolvedValueOnce(response({ order: { ...refundedFulfillment, refund: { ...refund, status: 'awaiting_fulfillment' } } }))
    .mockResolvedValueOnce(response({ order: { ...refundedFulfillment, refund: { ...refund, status: 'ready_to_refund', confirmedAt: 1700000000002 } } }))
    .mockResolvedValueOnce(response({ order: { ...refundedFulfillment, refund: { ...refund, status: 'initiated', initiatedAt: 1700000000003 } } }))
  const view = await detail()
  expect(view.get('.order-state-pill').text()).toBe('履约侧已退款')
  expect(view.get('.refund-card [role="status"]').text()).toBe('待履约确认')
  await vi.advanceTimersByTimeAsync(15000)
  expect(view.get('.refund-card [role="status"]').text()).toBe('待发起退款')
  await vi.advanceTimersByTimeAsync(15000)
  expect(view.get('.refund-card [role="status"]').text()).toBe('已发起退款')
  expect(view.get('.refund-card').text()).toContain('实际到账请以收款记录为准')
  expect(view.find('.refund-card button').exists()).toBe(false)
})
