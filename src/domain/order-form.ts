import type { NewOrder } from './orders'
export interface ItemDraft { key: number; itemName: string; spec: string; salesPrice: string; quantity: number | string; upc?:string; catalogId?:string; imageUrl?:string }
export interface OrderDraft { cityId: string; brandId: string; plateId: string; items: ItemDraft[]; contacts: string; messages: string; referenceId: string; payPrice: string; arrivedTime: number | string }
export function yuanToCents(input: string): number {
  const value = input.trim()
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value)) throw new Error('金额需为最多两位小数的正数。')
  const [yuan = '0', fraction = ''] = value.split('.')
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'))
  if (cents <= 0 || cents > 99999999) throw new Error('金额需大于 0 且不超过 999999.99 元。')
  return cents
}
export function orderPayload(draft: OrderDraft): NewOrder {
  if (!draft.cityId || !draft.brandId || !draft.plateId) throw new Error('请选择城市、品牌和订单平台。')
  if (!draft.items.length || draft.items.length > 50) throw new Error('请填写 1 至 50 件商品。')
  const items = draft.items.map((item, index) => {
    if (!item.itemName.trim() || item.itemName.trim().length > 120) throw new Error(`请填写第 ${index + 1} 件商品的名称（最多 120 字）。`)
    const quantity = Number(item.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new Error(`第 ${index + 1} 件商品数量需为 1 至 9999 的整数。`)
    if (item.spec.trim().length > 120) throw new Error('商品规格最多 120 字。')
    return { itemName: item.itemName.trim(), spec: item.spec.trim(), salesPrice: yuanToCents(item.salesPrice), quantity, ...(item.upc ? {upc:item.upc} : {}), ...(item.catalogId ? {catalogId:item.catalogId} : {}), ...(item.imageUrl ? {imageUrl:item.imageUrl} : {}) }
  })
  if (!draft.contacts.trim() || draft.contacts.trim().length > 1000) throw new Error('请填写收件人、手机号与完整收件地址（最多 1000 字）。')
  if (draft.referenceId.trim().length > 100) throw new Error('外部订单号最多 100 字。')
  if (draft.messages.trim().length > 1000) throw new Error('用户备注最多 1000 字。')
  const arrivedTime = Number(draft.arrivedTime)
  if (!Number.isInteger(arrivedTime) || arrivedTime < 1 || arrivedTime > 1440) throw new Error('剩余送达时间需为 1 至 1440 分钟的整数。')
  return { cityId: draft.cityId, brandId: draft.brandId, plateId: draft.plateId, items, contacts: draft.contacts.trim(), messages: draft.messages.trim(), referenceId: draft.referenceId.trim(), payPrice: yuanToCents(draft.payPrice), arrivedTime }
}
export const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`
