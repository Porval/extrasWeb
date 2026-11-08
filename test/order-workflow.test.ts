import { afterEach, describe, expect, it, vi } from 'vitest'
import { orderApi } from '../src/api/orders'
const saved = { id:'saved-order',ownerId:'owner',items:[],payment:{status:'submitted'},review:{status:'not_submitted'},external:{status:'not_created'} }
afterEach(()=>vi.unstubAllGlobals())
describe('持久化订单接口',()=>{
  it('建单携带幂等编号，身份由服务端返回；手动付款提交不会在客户端改为已收款',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({order:saved})});vi.stubGlobal('fetch',fetcher)
    const input={cityId:'city',cityName:'上海',brandId:'brand',brandName:'品牌',plateId:'plate',platformName:'平台',items:[],contacts:'测试',messages:'',referenceId:'order',arrivedTime:30}
    await orderApi.create(input,'idempotent-key')
    expect(fetcher.mock.calls[0]?.[1].headers['Idempotency-Key']).toBe('idempotent-key')
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).not.toHaveProperty('payPrice')
    const result=await orderApi.manualPayment(saved.id,{reference:'BANK-001',description:'手动付款',screenshot:{contentType:'image/png',data:'test-base64'}})
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/orders/saved-order/manual-payment')
    expect(result.payment.status).toBe('submitted');expect(result.external.status).toBe('not_created')
  })
  it('查询包含服务端筛选和分页，异常订单响应明确报错',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({orders:[],total:0})}).mockResolvedValueOnce({ok:true,status:200,json:async()=>({order:{id:'broken'}})});vi.stubGlobal('fetch',fetcher)
    await orderApi.list({stage:'付款待审核',page:2,pageSize:10})
    const url=new URL(fetcher.mock.calls[0]?.[0],'http://localhost');expect(url.searchParams.get('page')).toBe('2');expect(url.searchParams.get('stage')).toBe('付款待审核')
    await expect(orderApi.get('broken')).rejects.toThrow('订单响应异常')
  })
  it('保留列表报价能力与报价详情，拒绝报价和实付金额不一致的响应',async()=>{
    const pending={...saved,payPrice:0,quote:{status:'pending'},payment:{status:'unpaid'}}
    const quoted={...pending,payPrice:2588,quote:{status:'quoted',amount:2588,note:'含配送费',quotedAt:1794100002000,quotedBy:'报价人'}}
    const response=(data:unknown)=>({ok:true,status:200,json:async()=>data})
    const fetcher=vi.fn()
      .mockResolvedValueOnce(response({orders:[pending],total:1,requiresQuote:false}))
      .mockResolvedValueOnce(response({order:quoted}))
      .mockResolvedValueOnce(response({order:{...quoted,payPrice:100}}))
    vi.stubGlobal('fetch',fetcher)
    await expect(orderApi.list({stage:'待报价'})).resolves.toMatchObject({requiresQuote:false,orders:[pending]})
    await expect(orderApi.get(saved.id)).resolves.toMatchObject(quoted)
    await expect(orderApi.get(saved.id)).rejects.toThrow('报价响应异常')
  })
})
