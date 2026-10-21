export interface FulfillmentMemo { id:string; content:string; createdAt?:number }
export interface DeliveryInfo { id:string; channel:string; orderNo:string; statusCode?:number; status:string; riderName:string; riderPhone:string; tips:string; errorMessage:string; fromName:string; fromPhone:string; fromAddress:string; toName:string; toPhone:string; toAddress:string; updatedAt?:number }
export interface FulfillmentState { status:'not_started'|'waiting'|'accepted'|'delivering'|'delivered'; updatedAt?:number; sourceCode?:number; sourceStatus?:string; sourceUpdatedAt?:number; hungup?:boolean; errorOrder?:boolean; errorMessage?:string; syncMessage?:string; syncedAt?:number; messages?:string; memos?:FulfillmentMemo[]; deliveries?:DeliveryInfo[] }
export interface Option { id: string; name: string }
export interface OrderOptions { cities: Option[]; brands: Option[]; platforms: Option[] }
export interface OrderItem { itemName: string; spec: string; salesPrice: number; quantity: number; upc?:string; catalogId?:string; imageUrl?:string }
export interface NewOrder {
  cityId: string
  brandId: string
  plateId: string
  items: OrderItem[]
  contacts: string
  messages: string
  referenceId: string
  payPrice: number
  arrivedTime: number
}
export type FulfillmentStatus = 'not_started' | 'waiting' | 'accepted' | 'delivering' | 'delivered'
export type OrderStage = '付款资料已退回' | '待付款' | '待收款确认' | '已收款待审核' | '审核未通过' | '审核通过待建单' | '待履约' | '履约中' | '已完成' | '已退款' | '履约异常' | '已挂起'
export interface OrderEvent { id: string; time: number; title: string; description: string }
export interface PaymentRejection { noteId:string; reason:string; reviewerName:string; rejectedAt:number }
export interface TimelyOrder extends NewOrder {
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
export const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  not_started: '审核通过后启动', waiting: '待接单', accepted: '已接单', delivering: '配送中', delivered: '已送达',
}
export function orderStage(order: TimelyOrder): OrderStage {
  if (order.payment.status === 'submitted') return '待收款确认'
  if (order.payment.status === 'unpaid') return order.payment.rejection ? '付款资料已退回' : '待付款'
  if (order.review.status === 'rejected') return '审核未通过'
  if (order.review.status !== 'approved') return '已收款待审核'
  if (order.external.status !== 'created') return '审核通过待建单'
  if (order.fulfillment.sourceCode === 6) return '已退款'
  if (order.fulfillment.sourceCode === 8 || order.fulfillment.errorOrder) return '履约异常'
  if (order.fulfillment.hungup) return '已挂起'
  if (order.fulfillment.status === 'delivered') return '已完成'
  if (order.fulfillment.status === 'waiting') return '待履约'
  return '履约中'
}
