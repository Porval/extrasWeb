import { ApiError, request } from './http'
import type { ScreenshotInput } from '../domain/payment-screenshot'
import type { NewOrder, OrderOptions, TimelyOrder } from '../domain/orders'
function orderValue(data: unknown): TimelyOrder {
  const value = (data as {order?:TimelyOrder})?.order
  if (!value || typeof value.id !== 'string' || typeof value.ownerId !== 'string' || !value.payment || !value.review || !value.external || !Array.isArray(value.items)) throw new ApiError(502,'订单响应异常。')
  return value
}
export interface CatalogProduct { id:string; name:string; upc:string; spec:string; price:number|null; brandName:string; brandId?:string; imageUrl?:string }
export const orderApi = {
  async products(query:string,page=1):Promise<{products:CatalogProduct[];page:number;hasMore:boolean}> {
    const result=await request('/api/products?'+new URLSearchParams({query,page:String(page)})) as {products:CatalogProduct[];page:number;hasMore:boolean}
    if (!result || !Array.isArray(result.products) || !result.products.every(item=>typeof item.id==='string'&&typeof item.name==='string'&&typeof item.upc==='string'&&(item.price===null||Number.isSafeInteger(item.price)))) throw new ApiError(502,'商品库响应异常。')
    return result
  },
  async options(): Promise<OrderOptions & {demo:boolean}> {
    const data=await request('/api/order-options') as OrderOptions & {demo:boolean}
    if (!data || !['cities','brands','platforms'].every(key=>Array.isArray(data[key as keyof OrderOptions]))) throw new ApiError(502,'订单目录响应异常。')
    return data
  },
  async create(input:NewOrder & {cityName:string;brandName:string;platformName:string},key:string) {
    return orderValue(await request('/api/orders', {...input}, {'Idempotency-Key':key}))
  },
  async get(id:string) { return orderValue(await request(`/api/orders/${encodeURIComponent(id)}`)) },
  async list(query:Record<string,string|number>) {
    const params=new URLSearchParams(Object.entries(query).filter(([,value])=>value!=='').map(([key,value])=>[key,String(value)]))
    const data=await request(`/api/orders?${params}`) as {orders:TimelyOrder[];total:number}
    if (!data || !Array.isArray(data.orders) || !Number.isInteger(data.total)) throw new ApiError(502,'订单列表响应异常。')
    return data
  },
  async manualPayment(id:string,input:{reference:string;description:string;screenshot:ScreenshotInput}) {
    return orderValue(await request(`/api/orders/${encodeURIComponent(id)}/manual-payment`,input,{},30000))
  },
}
