import { ref, watch } from 'vue'
import { auth } from './auth'
import type { FulfillmentStatus, NewOrder, OrderOptions, TimelyOrder } from '../domain/orders'
import { fulfillmentLabels } from '../domain/orders'

export const previewOptions: OrderOptions = {
  cities: [{ id: 'preview-shanghai', name: '上海' }, { id: 'preview-hangzhou', name: '杭州' }],
  brands: [{ id: 'preview-brand', name: '示例品牌' }],
  platforms: [{ id: 'preview-meituan', name: '美团' }, { id: 'preview-eleme', name: '饿了么' }, { id: 'preview-other', name: '其他' }],
}
export const previewOrders = ref<TimelyOrder[]>([])
watch(() => auth.session.value?.account.id, () => { previewOrders.value = [] }, { flush: 'sync' })

function event(order: TimelyOrder, title: string, description: string) {
  order.events.push({ id: crypto.randomUUID(), time: Date.now(), title, description })
}
function ownedOrder(id: string) {
  const account = auth.session.value?.account
  if (!account) throw new Error('请先登录。')
  const order = previewOrders.value.find(item => item.id === id && item.ownerId === account.id)
  if (!order) throw new Error('订单不存在或不属于当前登录账号。')
  return { order, account }
}
export function addPreviewOrder(input: NewOrder) {
  const account = auth.session.value?.account
  if (!account) throw new Error('请先登录。')
  const name = (key: keyof OrderOptions, id: string) => previewOptions[key].find(option => option.id === id)?.name || ''
  if (!name('cities', input.cityId) || !name('brands', input.brandId) || !name('platforms', input.plateId)) {
    throw new Error('请选择有效的城市、品牌及平台。')
  }
  if (input.referenceId && previewOrders.value.some(order => order.referenceId === input.referenceId)) throw new Error('预览列表中已存在此外部订单号。')
  const order: TimelyOrder = {
    ...structuredClone(input), id: crypto.randomUUID(), createdAt: Date.now(), ownerId: account.id,
    operatorName: account.personName, providerName: account.providerName,
    cityName: name('cities', input.cityId), brandName: name('brands', input.brandId), platformName: name('platforms', input.plateId),
    payment: { status: 'unpaid' }, review: { status: 'not_submitted' }, external: { status: 'not_created' }, fulfillment: { status: 'not_started' }, events: [],
  }
  event(order, '手工创建订单', `${account.providerName} · ${account.personName} 创建，等待本人付款。`)
  previewOrders.value.unshift(order)
  return order
}

/** Only simulates collection in memory. Payment does not create a fulfillment order. */
export async function payPreviewOrder(id: string) {
  const { order, account } = ownedOrder(id)
  if (order.payment.status !== 'unpaid') throw new Error('该订单已经收款，请勿重复操作。')
  order.payment = { status: 'paid', paidAt: Date.now(), payerId: account.id, payerName: account.personName }
  order.review = { status: 'pending' }
  event(order, '模拟收款成功', `${account.personName} 已完成付款流程预览，未发生实际扣款。`)
  event(order, '等待管理端审核', '收款后等待管理端审核结果，尚未创建履约订单。')
}

export interface PreviewManagementResult {
  settleOrderId: string
  resultId: string
  decision: 'approved' | 'rejected'
  reviewerName: string
  reason?: string
  timelyOrderId?: string
}
/** Proposed management result shape for page preview; this is not a live HTTP endpoint. */
export function receivePreviewManagementResult(result: PreviewManagementResult) {
  const { order } = ownedOrder(result.settleOrderId)
  if (order.payment.status !== 'paid') throw new Error('收款后才可处理审核结果。')
  if (!result.resultId.trim() || !result.reviewerName.trim()) throw new Error('审核结果和审核人员不能为空。')
  if (!['approved', 'rejected'].includes(result.decision)) throw new Error('审核结果无效。')
  if (result.decision === 'rejected' && result.timelyOrderId) throw new Error('审核未通过不能关联履约订单。')
  if (order.review.status !== 'pending') {
    if (order.review.resultId !== result.resultId || order.review.status !== result.decision) throw new Error('该订单已有不同的审核结果。')
    if (order.external.timelyOrderId && result.timelyOrderId && order.external.timelyOrderId !== result.timelyOrderId) throw new Error('该订单已关联另一笔履约订单。')
  } else {
    order.review = { status: result.decision, resultId: result.resultId, reviewerName: result.reviewerName, reviewedAt: Date.now(), reason: result.reason || '' }
    event(order, result.decision === 'approved' ? '管理端审核通过（模拟）' : '管理端审核未通过（模拟）', `${result.reviewerName}：${result.reason || (result.decision === 'approved' ? '收款确认审核通过。' : '请联系管理端核实。')}`)
  }
  if (result.decision === 'approved' && order.external.status !== 'created') {
    if (result.timelyOrderId?.trim()) {
      order.external = { status: 'created', timelyOrderId: result.timelyOrderId.trim(), createdAt: Date.now() }
      order.fulfillment = { status: 'waiting', updatedAt: Date.now() }
      event(order, '管理端回传履约订单（模拟）', `关联演示履约订单 ${order.external.timelyOrderId}，等待履约方接单。`)
    } else {
      order.external.status = 'creating'
    }
  }
  return order
}
const nextFulfillment: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  waiting: 'accepted', accepted: 'delivering', delivering: 'delivered',
}
export function advancePreviewFulfillment(id: string) {
  const { order } = ownedOrder(id)
  if (order.payment.status !== 'paid' || order.review.status !== 'approved' || order.external.status !== 'created') throw new Error('收款、审核通过并关联履约订单后才能推进履约。')
  const next = nextFulfillment[order.fulfillment.status]
  if (!next) throw new Error('订单已完成，不能继续推进。')
  order.fulfillment = { status: next, updatedAt: Date.now() }
  event(order, `模拟${fulfillmentLabels[next]}`, '此进度用于页面演示，后续由外部系统同步。')
}
