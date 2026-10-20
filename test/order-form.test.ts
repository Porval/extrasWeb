import { describe, expect, it, beforeEach } from 'vitest'
import { orderPayload, yuanToCents } from '../src/domain/order-form'
import type { OrderDraft } from '../src/domain/order-form'
import { addPreviewOrder, previewOrders, previewOptions } from '../src/state/order-preview'
import { auth } from '../src/state/auth'
import { orderStage } from '../src/domain/orders'
function draft():OrderDraft{return {cityId:'preview-shanghai',brandId:'preview-brand',plateId:'preview-meituan',items:[{key:1,itemName:'测试商品',spec:'500g',salesPrice:'12.34',quantity:2}],contacts:'测试收件人，13800138000，测试地址',messages:'测试备注',referenceId:'QA-ORDER-001',payPrice:'24.68',arrivedTime:30}}
beforeEach(()=>{previewOrders.value=[];auth.session.value={account:{id:'qa',providerName:'测试服务商',personName:'测试人员',mobile:'13800138000',role:'member',enabled:true},expiresAt:Date.now()+600000}})
describe('订单表单验证',()=>{
  it('元转换为分保持金额精确，拒绝零、负数、超限和三位小数',()=>{
    expect(yuanToCents('0.10')).toBe(10);expect(yuanToCents('12.34')).toBe(1234);expect(yuanToCents('1.2')).toBe(120)
    for(const value of ['0','-1','1.001','1e2','1000000','abc'])expect(()=>yuanToCents(value)).toThrow()
  })
  it('校验必填收件信息、商品信息、整数数量和送达时间，外部订单号选填',()=>{
    const data=draft();expect(orderPayload(data).items[0]?.salesPrice).toBe(1234);expect(orderPayload(data).payPrice).toBe(2468)
    for(const patch of [{contacts:''},{cityId:''},{items:[]},{arrivedTime:0},{arrivedTime:1.5}])expect(()=>orderPayload({...data,...patch})).toThrow()
    expect(()=>orderPayload({...data,items:[{...data.items[0]!,quantity:1.5}]})).toThrow()
    expect(()=>orderPayload({...data,items:[{...data.items[0]!,itemName:''}]})).toThrow()
    expect(orderPayload({...data,referenceId:''}).referenceId).toBe('')
    expect(orderPayload({...data,referenceId:'  '}).referenceId).toBe('')
    expect(()=>orderPayload({...data,referenceId:'x'.repeat(101)})).toThrow('外部订单号')
  })
  it('预览订单使用当前登录人员，隔离表单引用，拒绝重复订单号及未登录创建',()=>{
    const input=orderPayload(draft());const order=addPreviewOrder(input)
    expect(order.operatorName).toBe('测试人员');expect(order.providerName).toBe('测试服务商');expect(orderStage(order)).toBe('待付款');expect(order.ownerId).toBe('qa')
    expect(previewOrders.value).toHaveLength(1);input.items[0]!.itemName='之后的表单修改';expect(order.items[0]?.itemName).toBe('测试商品')
    expect(()=>addPreviewOrder(orderPayload(draft()))).toThrow('已存在')
    auth.session.value=null;expect(()=>addPreviewOrder({...input,referenceId:'new'})).toThrow('请先登录')
  })
  it('选择项必须来自预览选项，不能把无效配置保存到列表',()=>{
    expect(previewOptions.brands[0]?.name).toBe('示例品牌')
    expect(()=>addPreviewOrder({...orderPayload(draft()),brandId:'unknown'})).toThrow('有效')
  })
})
