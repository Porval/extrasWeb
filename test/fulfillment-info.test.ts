import {expect,it} from 'vitest'
import {mount} from '@vue/test-utils'
import FulfillmentInfo from '../src/components/FulfillmentInfo.vue'
import {orderStage} from '../src/domain/orders'
import type {FulfillmentState,TimelyOrder} from '../src/domain/orders'
const fulfillment:FulfillmentState={status:'delivering',sourceStatus:'配送中',messages:'门口联系',memos:[{id:'memo',content:'已安排配送',createdAt:Date.now()}],deliveries:[{id:'delivery',channel:'闪送',orderNo:'TRACK-001',status:'待取货',riderName:'测试配送员',riderPhone:'13800138000',tips:'即将取货',errorMessage:'',fromName:'专柜',fromPhone:'13900139000',fromAddress:'测试取件地址',toName:'收件人',toPhone:'13700137000',toAddress:'测试收件地址'}]}
it('显示接口快照中的备注、物流单号、配送员与收发件信息，兼容旧订单无配送资料',()=>{
 const full=mount(FulfillmentInfo,{props:{fulfillment}})
 for(const text of ['已安排配送','TRACK-001','测试配送员','13800138000','测试取件地址','测试收件地址','即将取货'])expect(full.text()).toContain(text)
 full.unmount()
 const compact=mount(FulfillmentInfo,{props:{fulfillment,compact:true}});expect(compact.text()).toContain('TRACK-001');expect(compact.text()).not.toContain('测试取件地址');compact.unmount()
 const empty=mount(FulfillmentInfo,{props:{fulfillment:{status:'waiting'}}});expect(empty.text()).toContain('暂无配送信息');empty.unmount()
})
it('已送达后退款或异常时显示真实状态',()=>{
 const order={payment:{status:'paid'},review:{status:'approved'},external:{status:'created'},fulfillment:{status:'delivered',sourceCode:6}} as TimelyOrder
 expect(orderStage(order)).toBe('已退款');order.fulfillment.sourceCode=8;expect(orderStage(order)).toBe('履约异常')
})
