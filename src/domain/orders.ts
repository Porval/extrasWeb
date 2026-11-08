export interface FulfillmentMemo { id:string; content:string; createdAt?:number }
export interface DeliveryInfo { id:string; channel:string; orderNo:string; statusCode?:number; status:string; riderName:string; riderPhone:string; tips:string; errorMessage:string; fromName:string; fromPhone:string; fromAddress:string; toName:string; toPhone:string; toAddress:string; updatedAt?:number }
export interface FulfillmentState { status:'not_started'|'waiting'|'accepted'|'delivering'|'delivered'; updatedAt?:number; sourceCode?:number; sourceStatus?:string; sourceUpdatedAt?:number; hungup?:boolean; errorOrder?:boolean; errorMessage?:string; syncMessage?:string; syncedAt?:number; messages?:string; memos?:FulfillmentMemo[]; deliveries?:DeliveryInfo[] }
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
  payPrice?: number
  arrivedTime: number
}
export type FulfillmentStatus = 'not_started' | 'waiting' | 'accepted' | 'delivering' | 'delivered'
export type OrderStage = '待报价' | '付款资料已退回' | '待付款' | '付款待审核' | '已停止履约' | '自动建单中' | '建单异常' | '待接单' | '已接单' | '配送中' | '已完成' | '履约异常' | '已挂起' | '已退款'
export interface OrderEvent { id: string; time: number; title: string; description: string }
export interface PaymentRejection { noteId:string; reason:string; reviewerName:string; rejectedAt:number }
export type OrderQuote = { status: 'pending' } | { status: 'quoted'; amount: number; note: string; quotedAt: number; quotedBy: string }
export interface TimelyOrder extends NewOrder {
  payPrice: number
  quote?: OrderQuote
  id: string
  createdAt: number
  ownerId: string
  operatorName: string
  providerName: string
  cityName: string
  brandName: string
  platformName: string
  payment: { screenshot?:{id:string;contentType:string;size:number;sha256:string;uploadedAt:number}; status: 'unpaid' | 'submitted' | 'paid'; noteId?: string; previousNoteId?: string; rejection?:PaymentRejection; rejections?:PaymentRejection[]; reference?: string; description?: string; submittedAt?: number; paidAt?: number; payerId?: string; payerName?: string }
  review: { status: 'not_submitted' | 'pending' | 'approved' | 'rejected'; resultId?: string; reviewerName?: string; reviewedAt?: number; reason?: string }
  external: { status: 'not_created' | 'queued' | 'creating' | 'retry' | 'attention' | 'created'; message?: string; timelyOrderId?: string; createdAt?: number }
  fulfillment: FulfillmentState
  events: OrderEvent[]
}
export const fulfillmentLabels = {
  not_started: '未开始', waiting: '待接单', accepted: '已接单', delivering: '配送中', delivered: '已完成',
} as const satisfies Record<FulfillmentStatus, string>
export function fulfillmentCreation(order: TimelyOrder): { label: OrderStage; message: string } | undefined {
  if (order.payment.status !== 'paid' || order.external.status === 'created') return
  if (order.review.status === 'rejected') {
    return { label: '已停止履约', message: order.review.reason || '请联系管理端核实。' }
  }
  if (order.review.status !== 'approved') {
    return { label: '建单异常', message: '这笔历史订单已确认到账，请联系管理端继续建单。' }
  }
  if (order.external.status === 'retry' || order.external.status === 'attention') {
    return { label: '建单异常', message: order.external.message || '履约订单暂未建成，请联系管理端核实。' }
  }
  return { label: '自动建单中', message: order.external.message || '已确认到账，系统正在自动创建履约订单。' }
}
export function orderStage(order: TimelyOrder): OrderStage {
  if (order.quote?.status === 'pending') return '待报价'
  if (order.payment.status === 'submitted') return '付款待审核'
  if (order.payment.status === 'unpaid') return order.payment.rejection ? '付款资料已退回' : '待付款'
  const creation = fulfillmentCreation(order)
  if (creation) return creation.label
  if (order.fulfillment.sourceCode === 6) return '已退款'
  if (order.fulfillment.sourceCode === 8 || order.fulfillment.errorOrder) return '履约异常'
  if (order.fulfillment.hungup) return '已挂起'
  return order.fulfillment.status === 'not_started' ? '待接单' : fulfillmentLabels[order.fulfillment.status]
}
