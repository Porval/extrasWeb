import { ApiError, request } from './http'
import type { ScreenshotInput } from '../domain/payment-screenshot'
import { refundStatusLabels } from '../domain/orders'
import type { NewOrder, OrderConfiguration, ProviderOrderDetail, TimelyOrder } from '../domain/orders'
function orderValue(data: unknown): TimelyOrder {
  const value = (data as {order?:TimelyOrder})?.order
  if (!value || typeof value.id !== 'string' || typeof value.ownerId !== 'string' || !value.payment || !value.review || !value.external || !Array.isArray(value.items)) throw new ApiError(502,'订单响应异常。')
  const quote = value.quote
  if (quote !== undefined && (!quote || (quote.status === 'pending' ? value.payPrice !== 0 : (
    quote.status !== 'quoted' || !Number.isSafeInteger(quote.amount) || quote.amount < 1 || quote.amount > 99999999 ||
    quote.amount !== value.payPrice || typeof quote.note !== 'string' || typeof quote.quotedBy !== 'string' ||
    !Number.isFinite(quote.quotedAt) || quote.quotedAt <= 0
  )))) throw new ApiError(502,'报价响应异常。')
  const refund = value.refund
  if (refund !== undefined && (!refund || !Object.hasOwn(refundStatusLabels, refund.status) ||
    typeof refund.id !== 'string' || !refund.id || typeof refund.reason !== 'string' || !refund.reason.trim() ||
    !Number.isFinite(refund.requestedAt) || refund.requestedAt <= 0 ||
    [refund.markedAt, refund.confirmedAt, refund.initiatedAt].some(time => time !== undefined && (!Number.isFinite(time) || time <= 0)) ||
    (refund.message !== undefined && typeof refund.message !== 'string')
  )) throw new ApiError(502, '退款申请响应异常。')
  return value
}
export interface CatalogProduct { id:string; name:string; upc:string; spec:string; price:number|null; brandName:string; brandId?:string; imageUrl?:string }
export const orderApi = {
  async products(query:string,page=1):Promise<{products:CatalogProduct[];page:number;hasMore:boolean;limited?:boolean}> {
    const result=await request('/api/products?'+new URLSearchParams({query,page:String(page)})) as {products:CatalogProduct[];page:number;hasMore:boolean;limited?:boolean}
    if (!result || !Array.isArray(result.products) || (result.limited !== undefined && typeof result.limited !== 'boolean') ||
      !result.products.every(item=>typeof item.id==='string'&&typeof item.name==='string'&&typeof item.upc==='string'&&(item.price===null||Number.isSafeInteger(item.price)))) throw new ApiError(502,'商品库响应异常。')
    return result
  },
  async options(): Promise<OrderConfiguration> {
    const data=await request('/api/order-options') as OrderConfiguration
    if (!data || !(['cities','brands','platforms'] as const).every(key=>Array.isArray(data[key])) ||
        (data.requiresQuote !== undefined && typeof data.requiresQuote !== 'boolean')) throw new ApiError(502,'订单目录响应异常。')
    return data
  },
  async create(input:NewOrder & {cityName:string;brandName:string;platformName:string},key:string) {
    return orderValue(await request('/api/orders', {...input}, {'Idempotency-Key':key}))
  },
  async get(id: string): Promise<ProviderOrderDetail> {
    const data = await request(`/api/orders/${encodeURIComponent(id)}`)
    const order = orderValue(data)
    const canRequestRefund = (data as { canRequestRefund?: unknown }).canRequestRefund === true
    return { ...order, canRequestRefund }
  },
  async requestRefund(id: string, reason: string, key: string) {
    const order = orderValue(await request(`/api/orders/${encodeURIComponent(id)}/refund-request`, { reason }, { 'Idempotency-Key': key }))
    if (order.id !== id || !order.refund) throw new ApiError(502, '退款申请响应异常。')
    return order
  },
  async list(query:Record<string,string|number>) {
    const params=new URLSearchParams(Object.entries(query).filter(([,value])=>value!=='').map(([key,value])=>[key,String(value)]))
    const data=await request(`/api/orders?${params}`) as {orders:TimelyOrder[];total:number;requiresQuote?:boolean}
    if (!data || !Array.isArray(data.orders) || !Number.isInteger(data.total) || (data.requiresQuote !== undefined && typeof data.requiresQuote !== 'boolean')) throw new ApiError(502,'订单列表响应异常。')
    return {...data, orders:data.orders.map(order=>orderValue({order}))}
  },
  async manualPayment(id:string,input:{reference:string;description:string;screenshot:ScreenshotInput;previousNoteId?:string}) {
    return orderValue(await request(`/api/orders/${encodeURIComponent(id)}/manual-payment`,input,{},30000))
  },
}
