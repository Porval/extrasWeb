import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FulfillmentInfo from '../src/components/FulfillmentInfo.vue'
import { orderStage, providerOrderEvents } from '../src/domain/orders'
import type { FulfillmentState, TimelyOrder } from '../src/domain/orders'

const legacyDelivery = {
  id: 'delivery', channel: '闪送', orderNo: 'TRACK-001', status: '待取货',
  riderName: '测试配送员', riderPhone: '13800138000',
  tips: '即将取货', errorMessage: '原始异常', fromAddress: '测试取件地址', toAddress: '测试收件地址',
}
const fulfillment = {
  status: 'delivering', sourceStatus: '平台原始状态', messages: '配送备注',
  memos: [{ id: 'memo', content: '内部安排' }], deliveries: [legacyDelivery],
} satisfies FulfillmentState & Record<string, unknown>
const deliveredOrder: TimelyOrder = {
  id: 'order', ownerId: 'member', providerName: '服务商', operatorName: '人员',
  cityId: 'city', cityName: '上海', brandId: 'brand', brandName: '品牌', plateId: 'platform', platformName: '美团',
  referenceId: '', contacts: '测试地址', messages: '', arrivedTime: 30, createdAt: 1794100000000, items: [],
  payPrice: 1000, payment: { status: 'paid' }, review: { status: 'approved' }, external: { status: 'created' },
  fulfillment: { status: 'delivered' }, events: [],
}

it.each([false, true])('配送中只展示公开的四项配送信息（compact=%s）', (compact) => {
  const view = mount(FulfillmentInfo, { props: { fulfillment, compact } })
  expect(view.findAll('dt').map(label => label.text())).toEqual(['配送平台', '运单号', '配送员', '配送员电话'])
  expect(view.findAll('dd').map(value => value.text())).toEqual(['闪送', 'TRACK-001', '测试配送员', '13800138000'])
  for (const hidden of ['待取货', '平台原始状态', '配送备注', '内部安排', '原始异常', '测试取件地址', '测试收件地址']) {
    expect(view.text()).not.toContain(hidden)
  }
  view.unmount()
})

it.each(['waiting', 'accepted', 'delivered'] as const)('%s 不展示遗留的配送信息', (status) => {
  const view = mount(FulfillmentInfo, { props: { fulfillment: { ...fulfillment, status } } })
  expect(view.find('[aria-label="配送信息"]').exists()).toBe(false)
  view.unmount()
})

it('兼容旧自配送资料和没有配送信息的订单', async () => {
  const view = mount(FulfillmentInfo, { props: { fulfillment: { status: 'delivering' } } })
  expect(view.find('[aria-label="配送信息"]').exists()).toBe(false)
  await view.setProps({ fulfillment: { status: 'delivering', deliveries: [{ channel: '配送平台', status: '自配送' }] } })
  expect(view.findAll('dd').map(value => value.text())).toEqual(['自配送'])
  view.unmount()
})

it('旧履约侧退款、异常及挂起字段不改变公开阶段', () => {
  const fulfillment = { status: 'delivered' as const, sourceCode: 6, hungup: true, errorOrder: true }
  expect(orderStage({ ...deliveredOrder, fulfillment })).toBe('已完成')
})

it('订单记录保留业务节点，并归并旧履约记录为公开阶段', () => {
  const titles = [
    '确认收款', '履约订单创建成功', '履约状态：waiting', '履约状态：履约方已付款',
    '履约状态：accepted', '履约信息已更新', '履约状态：配送中', '履约状态：已挂起',
    '履约状态：已送达', '履约状态：已完成', '申请退款',
  ]
  const events = providerOrderEvents({
    ...deliveredOrder,
    events: titles.map((title, time) => ({ id: String(time), time, title, description: '原始记录内容' })),
  })
  expect(events.map(event => event.title)).toEqual([
    '确认收款', '履约状态：待接单', '履约状态：已接单', '履约状态：配送中', '履约状态：已完成', '申请退款',
  ])
  expect(events.slice(1, -1).every(event => !event.description)).toBe(true)
  expect(events[0].description).toBe('原始记录内容')
})
