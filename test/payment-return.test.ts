import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import OrderDetailView from '../src/views/OrderDetailView.vue'
import OrdersView from '../src/views/OrdersView.vue'
import {auth} from '../src/state/auth'
import {orderStage} from '../src/domain/orders'
import type {TimelyOrder} from '../src/domain/orders'

const mocks=vi.hoisted(()=>({get:vi.fn(),list:vi.fn(),manualPayment:vi.fn(),replace:vi.fn(),encode:vi.fn()}))
vi.mock('../src/api/orders',()=>({orderApi:mocks}))
vi.mock('../src/domain/payment-screenshot',async original=>({...await original<typeof import('../src/domain/payment-screenshot')>(),encodePaymentScreenshot:mocks.encode}))
vi.mock('vue-router',()=>({useRoute:()=>({params:{id:'returned-order'}}),useRouter:()=>({replace:mocks.replace})}))
const screenshot={id:'old-screenshot',contentType:'image/png',size:4,sha256:'old-hash',uploadedAt:1700000000000}
function returned(noteId='old-note',reason='截图中的流水号与填写内容不一致'):TimelyOrder {
  const rejection={noteId,reason,reviewerName:'收款核对员',rejectedAt:1700000001000}
  return {id:'returned-order',ownerId:'member',referenceId:'',createdAt:1700000000000,providerName:'渠道',operatorName:'人员',platformName:'平台',cityName:'上海',brandName:'品牌',cityId:'city',brandId:'brand',plateId:'platform',contacts:'测试地址',messages:'',arrivedTime:30,payPrice:1234,payment:{status:'unpaid',noteId,reference:'OLD-REFERENCE',description:'上次提交说明',submittedAt:1700000000000,screenshot,rejection,rejections:[rejection]},review:{status:'not_submitted'},external:{status:'not_created'},fulfillment:{status:'not_started'},events:[],items:[]}
}
let wrapper:ReturnType<typeof mount>|undefined
const mountView=(view:typeof OrderDetailView|typeof OrdersView)=>mount(view,{global:{stubs:{RouterLink:{template:'<a><slot/></a>'}}}})
beforeEach(()=>{
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:new-payment-proof')
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{})
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
  auth.session.value={account:{id:'member',providerName:'渠道',personName:'人员',mobile:'13800138000',role:'member',enabled:true},expiresAt:Date.now()+100000}
  mocks.get.mockResolvedValue(returned())
  mocks.list.mockResolvedValue({orders:[returned()],total:1})
  mocks.encode.mockResolvedValue({contentType:'image/png',data:'new-screenshot-base64'})
  mocks.manualPayment.mockResolvedValue({...returned(),payment:{status:'submitted',noteId:'new-note',previousNoteId:'old-note',reference:'CORRECT-REFERENCE',screenshot:{...screenshot,id:'new-screenshot'}}})
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.useRealTimers()})
async function detail(){wrapper=mountView(OrderDetailView);await flushPromises();return wrapper}
async function chooseScreenshot(){
  const input=wrapper!.get('[aria-label="付款截图"]')
  const file=new File([new Uint8Array([137,80,78,71])],'new-proof.png',{type:'image/png'})
  Object.defineProperty(input.element,'files',{value:[file],configurable:true})
  await input.trigger('change')
  return file
}

it('订单列表清楚展示退回原因，引导修改资料而非再次付款',async()=>{
  wrapper=mountView(OrdersView);await flushPromises()
  expect(orderStage(returned())).toBe('付款资料已退回')
  expect(wrapper.get('.order-table').text()).toContain('付款资料已退回')
  expect(wrapper.get('.payment-returned-reason').text()).toContain('截图中的流水号与填写内容不一致')
  expect(wrapper.get('.order-table').text()).toContain('请勿重复付款')
  expect(wrapper.get('.table-link').text()).toBe('修改付款资料')
})

it('详情保留旧资料和参考图并预填，未重新选择截图时不能重提',async()=>{
  await detail()
  expect(wrapper!.get('.payment-returned-notice').text()).toContain('退回原因：截图中的流水号与填写内容不一致')
  expect(wrapper!.get('.payment-returned-notice').text()).toContain('请勿重复付款')
  expect(wrapper!.get('.previous-payment-proof').text()).toContain('OLD-REFERENCE')
  expect(wrapper!.get('.previous-payment-proof img').attributes('src')).toBe('/api/orders/returned-order/payment-screenshot')
  expect(wrapper!.get('.payment-return-history').text()).toContain('收款核对员')
  expect((wrapper!.get('[aria-label="付款流水号"]').element as HTMLInputElement).value).toBe('OLD-REFERENCE')
  expect((wrapper!.get('[aria-label="付款说明"]').element as HTMLTextAreaElement).value).toBe('上次提交说明')
  expect(wrapper!.get('[aria-label="付款流水号"]').attributes('readonly')).toBeUndefined()
  expect(wrapper!.get('.manual-payment-form button').text()).toBe('重新提交付款资料')
  await wrapper!.get('.manual-payment-form').trigger('submit')
  expect(wrapper!.get('[role="alert"]').text()).toContain('请重新选择付款截图')
  expect(mocks.manualPayment).not.toHaveBeenCalled()
  expect(mocks.encode).not.toHaveBeenCalled()
})

it('仅将修改后的付款资料、新截图及上一noteId提交，成功回订单列表',async()=>{
  await detail()
  await wrapper!.get('[aria-label="付款流水号"]').setValue('  CORRECT-REFERENCE  ')
  await wrapper!.get('[aria-label="付款说明"]').setValue('  已按真实记录补正  ')
  const file=await chooseScreenshot()
  await wrapper!.get('.manual-payment-form').trigger('submit');await flushPromises()
  expect(mocks.encode).toHaveBeenCalledExactlyOnceWith(file)
  expect(mocks.manualPayment).toHaveBeenCalledExactlyOnceWith('returned-order',{reference:'CORRECT-REFERENCE',description:'已按真实记录补正',previousNoteId:'old-note',screenshot:{contentType:'image/png',data:'new-screenshot-base64'}})
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({name:'orders'})
  expect(wrapper!.text()).toContain('付款信息已提交，等待管理端核对到账')
  expect(wrapper!.text()).not.toContain('已确认收款')
})

it('轮询更新退回原因时保留正在编辑的流水、说明和新截图',async()=>{
  await detail()
  await wrapper!.get('[aria-label="付款流水号"]').setValue('MY-DRAFT')
  await wrapper!.get('[aria-label="付款说明"]').setValue('正在编辑的说明')
  await chooseScreenshot()
  mocks.get.mockResolvedValue({...returned('another-note','请补充付款时间'),payment:{...returned('another-note','请补充付款时间').payment,reference:'SERVER-REFERENCE',description:'服务端旧资料'}})
  await vi.advanceTimersByTimeAsync(15000);await flushPromises()
  expect(mocks.get).toHaveBeenCalledTimes(2)
  expect(wrapper!.get('.payment-returned-notice').text()).toContain('请补充付款时间')
  expect((wrapper!.get('[aria-label="付款流水号"]').element as HTMLInputElement).value).toBe('MY-DRAFT')
  expect((wrapper!.get('[aria-label="付款说明"]').element as HTMLTextAreaElement).value).toBe('正在编辑的说明')
  expect(wrapper!.get('img[alt="待提交的付款截图预览"]').attributes('src')).toBe('blob:new-payment-proof')
})

it('尚未编辑时首次收到退回状态预填一次，同一资料轮询不反复覆盖',async()=>{
  const submitted=returned();submitted.payment={...submitted.payment,status:'submitted',rejection:undefined}
  mocks.get.mockResolvedValueOnce(submitted).mockResolvedValueOnce(returned()).mockResolvedValue({...returned(),payment:{...returned().payment,reference:'UNEXPECTED-CHANGE'}})
  await detail()
  expect(wrapper!.find('.manual-payment-form').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(15000);await flushPromises()
  expect((wrapper!.get('[aria-label="付款流水号"]').element as HTMLInputElement).value).toBe('OLD-REFERENCE')
  await vi.advanceTimersByTimeAsync(15000);await flushPromises()
  expect((wrapper!.get('[aria-label="付款流水号"]').element as HTMLInputElement).value).toBe('OLD-REFERENCE')
})

it('截图读取期间即使已有轮询响应更新了noteId，本轮提交仍使用点击时的previousNoteId',async()=>{
  let finishLoad!:(value:TimelyOrder)=>void,finishImage!:(value:{contentType:string;data:string})=>void
  mocks.get.mockResolvedValueOnce(returned()).mockImplementationOnce(()=>new Promise(resolve=>{finishLoad=resolve}))
  mocks.encode.mockImplementationOnce(()=>new Promise(resolve=>{finishImage=resolve}))
  await detail();await chooseScreenshot()
  await vi.advanceTimersByTimeAsync(15000)
  await wrapper!.get('.manual-payment-form').trigger('submit')
  finishLoad(returned('later-note','另一轮核对结果'));await flushPromises()
  finishImage({contentType:'image/png',data:'new-screenshot-base64'});await flushPromises()
  expect(mocks.manualPayment).toHaveBeenCalledExactlyOnceWith('returned-order',{reference:'OLD-REFERENCE',description:'上次提交说明',previousNoteId:'old-note',screenshot:{contentType:'image/png',data:'new-screenshot-base64'}})
})

it('历史已提交但无截图仍能补图，不发送退回重提字段',async()=>{
  const legacy=returned();legacy.payment={status:'submitted',noteId:'legacy-note',reference:'LEGACY-REFERENCE',description:'补图说明'}
  mocks.get.mockResolvedValue(legacy)
  await detail()
  expect(wrapper!.get('[aria-label="付款流水号"]').attributes('readonly')).toBeDefined()
  expect(wrapper!.get('.manual-payment-form button').text()).toBe('补充付款截图')
  await chooseScreenshot();await wrapper!.get('.manual-payment-form').trigger('submit');await flushPromises()
  expect(mocks.manualPayment).toHaveBeenCalledExactlyOnceWith('returned-order',{reference:'LEGACY-REFERENCE',description:'补图说明',screenshot:{contentType:'image/png',data:'new-screenshot-base64'}})
})
