import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CreateOrderView from '../src/views/CreateOrderView.vue'
import OrderDetailView from '../src/views/OrderDetailView.vue'
import OrdersView from '../src/views/OrdersView.vue'
import { auth } from '../src/state/auth'
import type { TimelyOrder } from '../src/domain/orders'

const mocks = vi.hoisted(() => ({ options: vi.fn(), products: vi.fn(), create: vi.fn(), get: vi.fn(), list: vi.fn(), manualPayment: vi.fn(), replace: vi.fn(), encode: vi.fn() }))
vi.mock('../src/api/orders', () => ({ orderApi: mocks }))
vi.mock('../src/domain/payment-screenshot', async original => ({
  ...await original<typeof import('../src/domain/payment-screenshot')>(),
  encodePaymentScreenshot: mocks.encode,
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'quote-order' } }), useRouter: () => ({ replace: mocks.replace }) }))

const catalog = { demo: false, cities: [{ id: 'city', name: '上海' }], brands: [{ id: 'brand', name: '品牌' }], platforms: [{ id: 'platform', name: '美团' }] }
const pending: TimelyOrder = {
  id: 'quote-order', ownerId: 'member', providerName: '渠道', operatorName: '建单人', cityId: 'city', cityName: '上海',
  brandId: 'brand', brandName: '品牌', plateId: 'platform', platformName: '美团', referenceId: 'QUOTE-001', contacts: '测试收件地址',
  messages: '', arrivedTime: 30, createdAt: 1794100000000, items: [{ itemName: '测试商品', spec: '', salesPrice: 1000, quantity: 1 }],
  payPrice: 0, quote: { status: 'pending' }, payment: { status: 'unpaid' }, review: { status: 'not_submitted' },
  external: { status: 'not_created' }, fulfillment: { status: 'not_started' }, events: [],
}
const quoted: TimelyOrder = { ...pending, payPrice: 2588, quote: { status: 'quoted', amount: 2588, note: '含配送费', quotedAt: 1794100002000, quotedBy: '报价人员' } }

let wrapper: ReturnType<typeof mount> | undefined
function render(view: typeof CreateOrderView | typeof OrderDetailView | typeof OrdersView) {
  wrapper = mount(view, { global: { stubs: { RouterLink: { template: '<a><slot/></a>' } } } })
  return wrapper
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:proof')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  auth.session.value = { account: { id: 'member', providerName: '渠道', personName: '建单人', mobile: '13800138000', role: 'member', enabled: true }, expiresAt: Date.now() + 60000 }
  mocks.options.mockResolvedValue({ ...catalog, requiresQuote: true })
  mocks.products.mockResolvedValue({ products: [], page: 1, hasMore: false })
  mocks.create.mockResolvedValue(pending)
  mocks.get.mockResolvedValue(pending)
  mocks.list.mockResolvedValue({ orders: [pending], total: 1 })
  mocks.encode.mockResolvedValue({ contentType: 'image/png', data: 'test-proof' })
  mocks.manualPayment.mockResolvedValue({ ...quoted, payment: { status: 'submitted' } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function fillCreation(view: ReturnType<typeof mount>, priceLabel: string) {
  await view.get('[aria-label="城市"]').setValue('city')
  await view.get('[aria-label="品牌"]').setValue('brand')
  await view.get('[aria-label="商品 1 名称"]').setValue('测试商品')
  await view.get(`[aria-label="${priceLabel}"]`).setValue('10.00')
  await view.get('[aria-label="收件信息"]').setValue('测试收件地址')
}

it('启用报价时可不填整单金额，保留商品参考单价并进入待报价订单详情', async () => {
  const view = render(CreateOrderView)
  await flushPromises()
  expect(view.find('[aria-label="订单应付金额"]').exists()).toBe(false)
  expect(view.get('button[type="submit"]').text()).toBe('提交订单，等待报价')
  await fillCreation(view, '商品 1 参考单价')
  await view.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.create).toHaveBeenCalledOnce()
  expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty('payPrice')
  expect(mocks.create.mock.calls[0]![0].items[0].salesPrice).toBe(1000)
  expect(mocks.replace).toHaveBeenCalledWith({ name: 'order-detail', params: { id: pending.id } })
})

it.each([undefined, false])('后台报价开关为 %s 时仍要求整单金额，旧建单行为不变', async requiresQuote => {
  mocks.options.mockResolvedValue({ ...catalog, ...(requiresQuote === undefined ? {} : { requiresQuote }) })
  const view = render(CreateOrderView)
  await flushPromises()
  await fillCreation(view, '商品 1 单价')
  await view.get('form').trigger('submit')
  expect(mocks.create).not.toHaveBeenCalled()
  await view.get('[aria-label="订单应付金额"]').setValue('12.34')
  await view.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ payPrice: 1234 }), expect.any(String))
})

it('待报价详情不显示零元或付款入口，轮询收到报价后可提交原付款资料', async () => {
  const view = render(OrderDetailView)
  await flushPromises()
  expect(view.get('.order-flow [aria-current="step"]').text()).toContain('管理端报价')
  expect(view.get('.order-overview').text()).toContain('待报价')
  expect(view.get('.order-overview').text()).not.toContain('¥0.00')
  expect(view.find('.manual-payment-form').exists()).toBe(false)
  expect(mocks.manualPayment).not.toHaveBeenCalled()
  mocks.get.mockResolvedValue(quoted)
  await vi.advanceTimersByTimeAsync(15000)
  await flushPromises()
  expect(view.get('.order-overview').text()).toContain('¥25.88')
  expect(view.get('.quote-card').text()).toContain('含配送费')
  expect(view.get('.quote-card').text()).toContain('报价时间')
  expect(view.get('.order-flow [aria-current="step"]').text()).toContain('手动付款')
  await view.get('[aria-label="付款流水号"]').setValue('BANK-001')
  const input = view.get('[aria-label="付款截图"]')
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'proof.png', { type: 'image/png' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await view.get('.manual-payment-form').trigger('submit')
  await flushPromises()
  expect(mocks.manualPayment).toHaveBeenCalledExactlyOnceWith(pending.id, { reference: 'BANK-001', description: '', screenshot: { contentType: 'image/png', data: 'test-proof' } })
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({ name: 'orders' })
})

it('列表按待报价筛选，轮询移出已报价记录，待付款筛选可见报价资料', async () => {
  let current = pending
  mocks.list.mockImplementation(async ({ stage }) => {
    const orders = !stage || (stage === '待报价' ? current.quote?.status === 'pending' : current.quote?.status === 'quoted') ? [current] : []
    return { orders, total: orders.length }
  })
  const view = render(OrdersView)
  await flushPromises()
  expect(view.get('.table-link').text()).toBe('查看订单')
  expect(view.get('.order-table tbody').text()).not.toContain('¥0.00')
  const tab = (label: string) => view.findAll('.order-status-tabs button').find(button => button.text() === label)!
  await tab('待报价').trigger('click')
  await flushPromises()
  expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ stage: '待报价' }))
  current = quoted
  await vi.advanceTimersByTimeAsync(15000)
  await flushPromises()
  expect(view.find('.table-link').exists()).toBe(false)
  await tab('待付款').trigger('click')
  await flushPromises()
  expect(view.get('.table-link').text()).toBe('查看报价并付款')
  expect(view.get('.order-table tbody').text()).toContain('¥25.88')
  expect(view.get('.quote-list-info').text()).toContain('含配送费')
})

it.each([false, undefined])('列表以接口能力保留待报价筛选（requiresQuote=%s），不额外请求目录', async requiresQuote => {
  mocks.list.mockResolvedValue({ orders: [], total: 0, ...(requiresQuote === undefined ? {} : { requiresQuote }) })
  const view = render(OrdersView)
  await flushPromises()
  const tab = view.findAll('.order-status-tabs button').find(button => button.text() === '待报价')
  expect(Boolean(tab)).toBe(requiresQuote === false)
  expect(mocks.options).not.toHaveBeenCalled()
  if (tab) {
    await tab.trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ stage: '待报价' }))
  }
})
