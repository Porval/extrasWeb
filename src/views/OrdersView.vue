<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { auth } from '../state/auth'
import ProductThumbnail from '../components/ProductThumbnail.vue'
import FulfillmentInfo from '../components/FulfillmentInfo.vue'
import { orderApi } from '../api/orders'
import { money } from '../domain/order-form'
import { fulfillmentCreationLabel, fulfillmentLabels, orderStage } from '../domain/orders'
import type { TimelyOrder } from '../domain/orders'
function localDate(value:number){const date=new Date(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
const today=localDate(Date.now())
const filters=reactive({date:today,contacts:'',reference:'',item:''})
const applied=ref({...filters})
const status=ref('全部')
const quoteSupported=ref(false)
const noticeStages = ['待报价', '已收款待审核'] as const
const pendingCounts = reactive<Partial<Record<string, number>>>({})
const statuses=computed(()=>['全部',...(quoteSupported.value?['待报价']:[]),'待付款','待收款确认','已收款待审核','审核未通过','待履约','履约中','已完成','已退款','履约异常','已挂起'])
const page=ref(1),pageSize=ref(10),shown=ref<TimelyOrder[]>([]),total=ref(0),loading=ref(false),error=ref('')
const pages=computed(()=>Math.max(1,Math.ceil(total.value/pageSize.value)))
let epoch=0,noticeEpoch=0,timer:ReturnType<typeof setInterval>|undefined
function loadNotices() {
  const owner = auth.session.value?.account.id
  if (!owner) return
  const started = ++noticeEpoch
  for (const stage of noticeStages) {
    void orderApi.list({ stage, page: 1, pageSize: 1 }).catch(() => null).then(data => {
      if (started !== noticeEpoch || owner !== auth.session.value?.account.id) return
      const hasMatchingOrder = data?.orders.some(order => orderStage(order) === stage)
      if (stage === '待报价' && (typeof data?.requiresQuote === 'boolean' || hasMatchingOrder)) quoteSupported.value = true
      pendingCounts[stage] = data && hasMatchingOrder ? data.total : 0
    })
  }
}
async function load(){
  const owner=auth.session.value?.account.id
  if (!owner) return
  const started=++epoch;loading.value=true
  try{const data=await orderApi.list({...applied.value,stage:status.value==='全部'?'':status.value,page:page.value,pageSize:pageSize.value});if(started===epoch&&owner===auth.session.value?.account.id){shown.value=data.orders;total.value=data.total;error.value='';if(typeof data.requiresQuote==='boolean'||data.orders.some(order=>order.quote))quoteSupported.value=true}}
  catch(e){if(started===epoch)error.value=e instanceof Error?e.message:'订单加载失败'}
  finally{if(started===epoch)loading.value=false}
}
function refresh() {
  void load()
  loadNotices()
}
function applyFilters(){applied.value={...filters};if(page.value!==1)page.value=1;else void load()}
function resetFilters(){Object.assign(filters,{date:today,contacts:'',reference:'',item:''});status.value='全部';applyFilters()}
watch([status,pageSize],()=>{if(page.value!==1)page.value=1;else void load()})
watch(page,()=>void load())
watch(()=>auth.session.value?.account.id, owner => {
  epoch++; noticeEpoch++; shown.value=[]; total.value=0; quoteSupported.value=false
  for (const stage of noticeStages) pendingCounts[stage] = 0
  if (owner) refresh()
})
onMounted(()=>{refresh();timer=setInterval(()=>{if(!document.hidden)refresh()},15000)})
onUnmounted(()=>{epoch++;noticeEpoch++;clearInterval(timer)})
const date=(value:number)=>new Date(value).toLocaleString('zh-CN',{hour12:false})
</script>
<template>
  <section class="admin-page orders-page">
    <div class="admin-page-heading"><div><h1>{{ auth.session.value?.account.providerName }} - 及时达订单</h1><span>{{quoteSupported?'手动建单 · 管理端报价 · 付款审核 · 查看履约':'手动建单付款 · 管理端审核 · 查看履约'}}</span></div></div>
    <p v-if="quoteSupported" class="preview-note">报价完成后，按报价付款并提交资料。管理端确认收款并审核，通过后系统自动创建履约订单。</p><p v-else class="preview-note">订单已存入后台数据库。手动付款后提交付款信息，由管理端核对收款并审核；审核通过后自动建单。</p><p v-if="error" class="admin-error" role="alert">{{error}}</p>
    <div class="order-identity-strip"><span>服务商：<strong>{{ auth.session.value?.account.providerName }}</strong></span><span>创建 / 付款人员：<strong>{{ auth.session.value?.account.personName }}</strong></span><span>当前账号的订单</span></div>
    <form class="order-filters" @submit.prevent="applyFilters">
      <input v-model="filters.date" type="date" aria-label="订单日期" @change="applyFilters">
      <div class="search-field"><input v-model="filters.contacts" aria-label="联系人或收件信息" placeholder="请输入联系人"><button type="submit" aria-label="搜索联系人">⌕</button></div>
      <div class="search-field"><input v-model="filters.reference" aria-label="外部订单号筛选" placeholder="请输入外部订单号"><button type="submit" aria-label="搜索订单号">⌕</button></div>
      <div class="search-field"><input v-model="filters.item" aria-label="商品信息筛选" placeholder="请输入商品信息"><button type="submit" aria-label="搜索商品">⌕</button></div>
    </form>
    <div class="order-list-actions">
      <div class="order-status-tabs" aria-label="订单状态筛选">
        <button v-for="item in statuses" :key="item" :class="{ active: status === item }" :aria-pressed="status === item"
          :aria-label="pendingCounts[item] ? `${item}，${pendingCounts[item]} 笔` : undefined" @click="status = item">
          <span class="order-tab-label">{{ item }}<span v-if="pendingCounts[item]" class="order-tab-notice" aria-hidden="true"></span></span>
        </button>
      </div>
      <div class="order-toolbar-buttons"><button class="plain-button" @click="resetFilters">重置过滤条件</button><RouterLink class="mint-button" :to="{ name: 'create-order' }">新建订单</RouterLink></div>
    </div>
    <div class="order-table-scroll">
      <table class="order-table"><thead><tr><th>服务商 / 人员</th><th>订单进度</th><th>收款 / 审核状态</th><th>商品</th><th>应付金额</th><th>收件信息</th><th>外部订单号</th><th>履约订单号 / 状态</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody><tr v-for="order in shown" :key="order.id">
          <td>{{ order.providerName }}<br><span>{{ order.operatorName }}</span></td>
          <td><span class="order-state-pill" :class="{returned:order.payment.status==='unpaid'&&order.payment.rejection}">{{ orderStage(order) }}</span></td>
          <td><span v-if="order.quote?.status==='pending'">等待管理端报价</span><template v-else-if="order.payment.status==='unpaid'&&order.payment.rejection"><strong class="payment-returned-label">付款资料已退回</strong><p class="payment-returned-reason">退回原因：{{order.payment.rejection.reason}}</p><span>请核对实际付款记录，修改资料后重提，请勿重复付款。</span></template><template v-else>{{ order.payment.status === 'paid' ? '已收款' : order.payment.status==='submitted' ? '付款信息已提交' : order.quote?.status==='quoted' ? '已报价，待付款' : '待付款' }}<br><span>{{ order.review.status === 'approved' ? '审核通过' : order.review.status === 'rejected' ? '审核未通过' : order.review.status === 'pending' ? '待审核' : '尚未提交审核' }}</span></template></td>
          <td><div v-for="(item, index) in order.items" :key="index" class="order-item-identity"><ProductThumbnail :src="item.imageUrl" :name="item.itemName"/><div class="order-item-copy">{{ item.itemName }} <span v-if="item.spec">{{ item.spec }}</span> × {{ item.quantity }}</div></div></td>
          <td><template v-if="order.quote?.status==='pending'">—</template><template v-else>{{ money(order.payPrice) }}<div v-if="order.quote?.status==='quoted'" class="quote-list-info"><span>报价时间：{{date(order.quote.quotedAt)}}</span><p v-if="order.quote.note">{{order.quote.note}}</p></div></template></td><td class="contacts-cell">{{ order.contacts }}</td><td>{{ order.referenceId || '—' }}</td>
          <td>
            <template v-if="order.external.status === 'created'">
              {{ order.external.timelyOrderId }}<br><span>{{ order.fulfillment.sourceStatus || fulfillmentLabels[order.fulfillment.status] }}</span>
              <FulfillmentInfo :fulfillment="order.fulfillment" compact />
              <span v-if="order.fulfillment.syncMessage">{{ order.fulfillment.syncMessage }}</span>
            </template>
            <span v-else>{{ order.review.status === 'approved' ? order.external.message || fulfillmentCreationLabel(order.external.status) : '审核通过后自动建单' }}</span>
          </td>
          <td>{{ date(order.createdAt) }}</td><td><RouterLink class="table-link" :to="{ name: 'order-detail', params: { id: order.id } }">{{ order.quote?.status==='pending' ? '查看订单' : order.payment.status==='unpaid' ? order.payment.rejection ? '修改付款资料' : order.quote?.status==='quoted' ? '查看报价并付款' : '去付款' : '查看进度' }}</RouterLink></td>
        </tr></tbody>
      </table>
      <div v-if="!shown.length" class="order-empty"><span aria-hidden="true">▱</span><p>{{loading?'正在加载订单…':'暂无符合条件的订单'}}</p></div>
    </div>
    <div class="order-pagination"><span>共 {{ total }} 条</span><button class="page-button" :disabled="page <= 1" aria-label="上一页" @click="page--">‹</button><span class="current-page">{{ page }}</span><button class="page-button" :disabled="page >= pages" aria-label="下一页" @click="page++">›</button><select v-model.number="pageSize" aria-label="每页订单数"><option :value="10">10 条/页</option><option :value="20">20 条/页</option><option :value="50">50 条/页</option></select></div>
  </section>
</template>
