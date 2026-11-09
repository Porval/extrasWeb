import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import OrderDetailView from '../src/views/OrderDetailView.vue'
import {auth} from '../src/state/auth'
const mocks=vi.hoisted(()=>({get:vi.fn(),manualPayment:vi.fn(),replace:vi.fn()}))
vi.mock('../src/api/orders',()=>({orderApi:mocks}))
vi.mock('vue-router',()=>({useRoute:()=>({params:{id:'order'}}),useRouter:()=>({replace:mocks.replace})}))
let wrapper:ReturnType<typeof mount>
beforeEach(()=>{
  vi.clearAllMocks()
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:payment-proof')
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{})
  auth.session.value={account:{id:'member',providerName:'渠道',personName:'人员',mobile:'13800138000',role:'member',enabled:true},expiresAt:Date.now()+100000}
  mocks.get.mockResolvedValue({id:'order',referenceId:'',createdAt:Date.now(),providerName:'渠道',operatorName:'人员',platformName:'平台',cityName:'上海',brandName:'品牌',contacts:'测试地址',messages:'',arrivedTime:30,payPrice:1234,payment:{status:'unpaid'},review:{status:'not_submitted'},external:{status:'not_created'},fulfillment:{status:'not_started'},events:[],items:[]})
})
afterEach(()=>wrapper?.unmount())
async function fillPayment(){
  wrapper=mount(OrderDetailView,{global:{stubs:{RouterLink:true}}});await flushPromises()
  await wrapper.get('[aria-label="付款流水号"]').setValue('BANK-001')
  await wrapper.get('[aria-label="付款说明"]').setValue('转账付款')
  const file=wrapper.get('[aria-label="付款截图"]')
  Object.defineProperty(file.element,'files',{value:[new File([new Uint8Array([137,80,78,71])],'proof.png',{type:'image/png'})],configurable:true})
  await file.trigger('change')
}
it('付款提交成功后返回及时达订单列表，跳转前不会把订单标为已收款',async()=>{
  let finish!:(value:unknown)=>void
  mocks.manualPayment.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  await fillPayment();await wrapper.get('.manual-payment-form').trigger('submit')
  await vi.waitFor(()=>expect(mocks.manualPayment).toHaveBeenCalledWith('order',{reference:'BANK-001',description:'转账付款',screenshot:{contentType:'image/png',data:'iVBORw=='}}))
  expect(mocks.replace).not.toHaveBeenCalled();expect(wrapper.text()).toContain('待付款')
  finish({...await mocks.get(),payment:{status:'submitted',screenshot:{id:'proof'}}});await flushPromises()
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({name:'orders'})
})
it('提交失败停留详情，保留流水号、付款说明及截图，允许重试',async()=>{
  mocks.manualPayment.mockRejectedValue(new Error('付款信息提交失败，请重试'))
  await fillPayment();await wrapper.get('.manual-payment-form').trigger('submit')
  await vi.waitFor(()=>expect(wrapper.get('[role="alert"]').text()).toContain('请重试'))
  expect(mocks.replace).not.toHaveBeenCalled()
  expect((wrapper.get('[aria-label="付款流水号"]').element as HTMLInputElement).value).toBe('BANK-001')
  expect((wrapper.get('[aria-label="付款说明"]').element as HTMLTextAreaElement).value).toBe('转账付款')
  expect(wrapper.get('.payment-screenshot-link img').attributes('src')).toBe('blob:payment-proof')
  expect(wrapper.get('.manual-payment-form button').attributes('disabled')).toBeUndefined()
})
it('付款流水号可留空，拖入微信图片文件即可提交必填截图', async () => {
  mocks.manualPayment.mockImplementation(async () => ({ ...await mocks.get(), payment: { status: 'submitted', screenshot: { id: 'proof' } } }))
  wrapper = mount(OrderDetailView, { attachTo: document.body, global: { stubs: { RouterLink: true } } })
  await flushPromises()
  expect(wrapper.get('.manual-payment-form').text()).toContain('付款流水号（选填）')
  const submit = wrapper.get('.manual-payment-form button')
  await submit.trigger('click')
  expect(wrapper.get('[role="alert"]').text()).toContain('请上传付款截图')
  expect(mocks.manualPayment).not.toHaveBeenCalled()

  const dropZone = wrapper.get('.payment-screenshot-drop')
  await dropZone.trigger('drop', { dataTransfer: { files: [], items: [{ kind: 'string', type: 'text/uri-list' }] } })
  expect(wrapper.get('[role="alert"]').text()).toContain('请拖入付款截图文件')
  expect(wrapper.find('.payment-screenshot-link img').exists()).toBe(false)

  const screenshot = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], '微信截图.PNG')
  await dropZone.trigger('drop', {
    dataTransfer: { files: [], items: [{ kind: 'file', getAsFile: () => screenshot }] },
  })
  expect(dropZone.text()).toContain('已选择 微信截图.PNG')
  expect(wrapper.get('.payment-screenshot-link img').attributes('src')).toBe('blob:payment-proof')
  await submit.trigger('click')
  await vi.waitFor(() => expect(mocks.manualPayment).toHaveBeenCalledExactlyOnceWith('order', {
    reference: '', description: '', screenshot: { contentType: 'image/png', data: 'iVBORw0KGgo=' },
  }))
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({ name: 'orders' })
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:payment-proof')
})
