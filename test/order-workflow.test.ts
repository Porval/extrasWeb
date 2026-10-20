import { afterEach, describe, expect, it, vi } from 'vitest'
import { orderApi } from '../src/api/orders'
const saved = { id:'saved-order',ownerId:'owner',items:[],payment:{status:'submitted'},review:{status:'not_submitted'},external:{status:'not_created'} }
afterEach(()=>vi.unstubAllGlobals())
describe('持久化订单接口',()=>{
  it('建单携带幂等编号，身份由服务端返回；手动付款提交不会在客户端改为已收款',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({order:saved})});vi.stubGlobal('fetch',fetcher)
    const input={cityId:'city',cityName:'上海',brandId:'brand',brandName:'品牌',plateId:'plate',platformName:'平台',items:[],contacts:'测试',messages:'',referenceId:'order',payPrice:100,arrivedTime:30}
    await orderApi.create(input,'idempotent-key')
    expect(fetcher.mock.calls[0]?.[1].headers['Idempotency-Key']).toBe('idempotent-key')
    const result=await orderApi.manualPayment(saved.id,{reference:'BANK-001',description:'手动付款',screenshot:{contentType:'image/png',data:'test-base64'}})
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/orders/saved-order/manual-payment')
    expect(result.payment.status).toBe('submitted');expect(result.external.status).toBe('not_created')
  })
  it('查询包含服务端筛选和分页，异常订单响应明确报错',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({orders:[],total:0})}).mockResolvedValueOnce({ok:true,status:200,json:async()=>({order:{id:'broken'}})});vi.stubGlobal('fetch',fetcher)
    await orderApi.list({stage:'已收款待审核',page:2,pageSize:10})
    const url=new URL(fetcher.mock.calls[0]?.[0],'http://localhost');expect(url.searchParams.get('page')).toBe('2');expect(url.searchParams.get('stage')).toBe('已收款待审核')
    await expect(orderApi.get('broken')).rejects.toThrow('订单响应异常')
  })
})
