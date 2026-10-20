import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import OrdersView from '../src/views/OrdersView.vue'
import OrderDetailView from '../src/views/OrderDetailView.vue'
import {auth} from '../src/state/auth'
const api=vi.hoisted(()=>({list:vi.fn(),get:vi.fn()}))
vi.mock('../src/api/orders',()=>({orderApi:api}))
vi.mock('vue-router',()=>({useRoute:()=>({params:{id:'order'}}),useRouter:()=>({replace:vi.fn()})}))
let wrapper:ReturnType<typeof mount>
beforeEach(()=>{
  auth.session.value={account:{id:'member',providerName:'渠道',personName:'人员',mobile:'13800138000',role:'member',enabled:true},expiresAt:Date.now()+100000}
  const order={id:'order',referenceId:'',createdAt:Date.now(),providerName:'渠道',operatorName:'人员',platformName:'平台',cityName:'上海',brandName:'品牌',contacts:'测试地址',messages:'',arrivedTime:30,payPrice:1234,payment:{status:'unpaid'},review:{status:'not_submitted'},external:{status:'not_created'},fulfillment:{status:'not_started'},events:[],items:[{itemName:'有图商品',spec:'20ml',salesPrice:1234,quantity:1,imageUrl:'https://cdn.example/product.jpg'},{itemName:'旧版无图商品',spec:'',salesPrice:1234,quantity:1}]}
  api.list.mockResolvedValue({orders:[order],total:1});api.get.mockResolvedValue(order)
})
afterEach(()=>wrapper?.unmount())
it.each([['订单列表',OrdersView],['订单详情',OrderDetailView]] as const)('%s 显示商品快照图，兼容无图商品和图片失效',async(_name,view)=>{
  wrapper=mount(view,{global:{stubs:{RouterLink:true}}});await flushPromises()
  const images=wrapper.findAll('.order-product-thumbnail')
  expect(images).toHaveLength(2)
  expect(images[0]!.get('img').attributes('src')).toBe('https://cdn.example/product.jpg')
  expect(images[0]!.get('img').attributes('alt')).toBe('有图商品商品图')
  expect(images[1]!.text()).toBe('暂无图')
  await images[0]!.get('img').trigger('error');expect(images[0]!.text()).toBe('暂无图')
})
