export interface DeliveryInfo {
  id?: string
  channel?: string
  orderNo?: string
  riderName?: string
  riderPhone?: string
  status?: string
}
export interface FulfillmentState { status: FulfillmentStatus; updatedAt?: number; deliveries?: DeliveryInfo[] }
export interface Option { id: string; name: string }
export interface OrderOptions { cities: Option[]; brands: Option[]; platforms: Option[] }
export interface OrderConfiguration extends OrderOptions { demo: boolean; requiresQuote?: boolean }
export interface OrderItem { itemName: string; spec: string; salesPrice: number; quantity: number; upc?:string; catalogId?:string; imageUrl?:string }
export interface NewOrder {
  cityId: string
  brandId: string
  plateId: string
  items: OrderItem[]
  contacts: string
  messages: string
  referenceId: string
  arrivedTime: number
}
export type FulfillmentStatus = 'not_started' | 'waiting' | 'accepted' | 'delivering' | 'delivered'
export type OrderStage = '待报价' | '付款资料已退回' | '待付款' | '付款待审核' | '已停止履约' | '自动建单中' | '建单异常' | '待接单' | '已接单' | '配送中' | '已完成'
export interface OrderEvent { id: string; time: number; title: string; description: string }
export interface PaymentRejection { noteId:string; reason:string; reviewerName:string; rejectedAt:number }
export type OrderQuote = { status: 'pending' } | { status: 'quoted'; amount: number; note: string; quotedAt: number; quotedBy: string }
export const refundStatusLabels = {
  requested: '退款待处理',
  mark_pending: '退款标识待核对',
  awaiting_fulfillment: '待履约确认',
  ready_to_refund: '待发起退款',
  initiated: '已发起退款',
} as const
export interface OrderRefund {
  id: string
  status: keyof typeof refundStatusLabels
  reason: string
  requestedAt: number
  markedAt?: number
  confirmedAt?: number
  initiatedAt?: number
  message?: string
}
export interface TimelyOrder extends NewOrder {
  payPrice: number
  quote?: OrderQuote
  refund?: OrderRefund
  id: string
  createdAt: number
  ownerId: string
  operatorName: string
  providerName: string
  cityName: string
  brandName: string
  platformName: string
  payment: { screenshot?:{id:string;contentType:string;size:number;sha256:string;uploadedAt:number}; status: 'unpaid' | 'submitted' | 'paid'; noteId?: string; previousNoteId?: string; rejection?:PaymentRejection; rejections?:PaymentRejection[]; reference?: string; description?: string; submittedAt?: number; paidAt?: number; confirmedAt?: number; payerId?: string; payerName?: string }
  review: { status: 'not_submitted' | 'pending' | 'approved' | 'rejected'; resultId?: string; reviewerName?: string; reviewedAt?: number; reason?: string }
  external: { status: 'not_created' | 'queued' | 'creating' | 'retry' | 'attention' | 'created'; message?: string; timelyOrderId?: string; createdAt?: number }
  fulfillment: FulfillmentState
  events: OrderEvent[]
}
export type ProviderOrderDetail = TimelyOrder & { canRequestRefund?: boolean }
export const fulfillmentLabels = {
  not_started: '未开始', waiting: '待接单', accepted: '已接单', delivering: '配送中', delivered: '已完成',
} as const satisfies Record<FulfillmentStatus, string>
const publicPhases = ['waiting', 'accepted', 'delivering', 'delivered'] as const
const publicFulfillmentEvents = new Map<string, number>([
  ...publicPhases.map((phase, index) => [phase, index] as const),
  ...publicPhases.map((phase, index) => [fulfillmentLabels[phase], index] as const),
  ['履约方已付款', 1], ['已呼叫跑腿', 1], ['履约方已申请付款', 1], ['已送达', 3],
])
const fulfillmentEventPrefix = '履约状态：'
const createdEvents = new Set(['履约订单创建成功', '管理端核对履约订单后关联'])
const businessEvents = new Set([
  '手工创建订单', '管理端已报价', '提交手动付款信息', '补充付款截图', '重新提交付款资料', '付款资料已退回', '确认收款',
  '管理端审核通过', '管理端审核未通过', '申请退款', '发起履约退款标识', '履约退款标识已创建', '履约已确认退款标识', '已发起退款',
])
export function providerOrderEvents(order: TimelyOrder): OrderEvent[] {
  const currentPhase = order.external.status === 'created'
    ? Math.max(0, publicFulfillmentEvents.get(order.fulfillment.status) ?? 0) : -1
  let latestPhase = -1
  return (order.events ?? []).flatMap(event => {
    const phase = createdEvents.has(event.title) ? 0 : event.title.startsWith(fulfillmentEventPrefix)
      ? publicFulfillmentEvents.get(event.title.slice(fulfillmentEventPrefix.length)) : undefined
    if (phase !== undefined) {
      if (phase <= latestPhase || phase > currentPhase) return []
      latestPhase = phase
      return [{ ...event, title: fulfillmentEventPrefix + fulfillmentLabels[publicPhases[phase]], description: '' }]
    }
    return businessEvents.has(event.title) ? [event] : []
  })
}
export function fulfillmentCreation(order: TimelyOrder): { label: OrderStage; message: string } | undefined {
  if (order.payment.status !== 'paid' || order.external.status === 'created') return
  if (order.review.status === 'rejected') {
    return { label: '已停止履约', message: order.review.reason || '请联系管理端核实。' }
  }
  if (order.review.status !== 'approved') {
    return { label: '建单异常', message: '这笔历史订单已确认到账，请联系管理端继续建单。' }
  }
  if (order.external.status === 'retry' || order.external.status === 'attention') {
    return { label: '建单异常', message: '履约订单暂未建成，请联系管理端核实。' }
  }
  return { label: '自动建单中', message: '已确认到账，系统正在自动创建履约订单。' }
}
export function orderStage(order: TimelyOrder): OrderStage {
  if (order.quote?.status === 'pending') return '待报价'
  if (order.payment.status === 'submitted') return '付款待审核'
  if (order.payment.status === 'unpaid') return order.payment.rejection ? '付款资料已退回' : '待付款'
  const creation = fulfillmentCreation(order)
  if (creation) return creation.label
  const status = order.fulfillment.status
  return status === 'not_started' ? '待接单' : fulfillmentLabels[status] || '待接单'
}
