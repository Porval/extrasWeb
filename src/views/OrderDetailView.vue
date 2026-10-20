<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth } from '../state/auth'
import ProductThumbnail from '../components/ProductThumbnail.vue'
import FulfillmentInfo from '../components/FulfillmentInfo.vue'
import { orderApi } from '../api/orders'
import { money } from '../domain/order-form'
import { fulfillmentLabels, orderStage } from '../domain/orders'
import { encodePaymentScreenshot, validatePaymentScreenshot } from '../domain/payment-screenshot'
import type { TimelyOrder } from '../domain/orders'
const route=useRoute(),router=useRouter(),order=ref<TimelyOrder>(),loading=ref(true),saving=ref(false),error=ref('')
const paymentDraft=reactive({reference:'',description:''})
const screenshotFile=ref<File>(),screenshotPreview=ref('')
const screenshotUrl=computed(()=>order.value?.payment.screenshot ? `/api/orders/${encodeURIComponent(order.value.id)}/payment-screenshot` : '')
function clearScreenshot(){if(screenshotPreview.value)URL.revokeObjectURL(screenshotPreview.value);screenshotPreview.value='';screenshotFile.value=undefined}
function selectScreenshot(event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0]
  if(!file)return
  clearScreenshot()
  try{validatePaymentScreenshot(file);screenshotFile.value=file;screenshotPreview.value=URL.createObjectURL(file);error.value=''}
  catch(e){input.value='';error.value=e instanceof Error?e.message:'请选择有效图片'}
}
const reviewLabel=computed(()=>!order.value?'':order.value.payment.status==='submitted'?'待收款确认':({not_submitted:'待付款信息',pending:'已收款待审核',approved:'审核通过',rejected:'审核未通过'}[order.value.review.status]))
const step=computed(()=>{if(!order.value||order.value.payment.status==='unpaid')return 1;if(order.value.review.status!=='approved')return 2;if(order.value.external.status!=='created')return 3;return order.value.fulfillment.status==='delivered'?5:4})
let epoch=0,timer:ReturnType<typeof setInterval>|undefined
const date=(value?:number)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—'
async function load(){const started=++epoch,owner=auth.session.value?.account.id;try{const data=await orderApi.get(String(route.params.id));if(started===epoch&&owner===auth.session.value?.account.id){order.value=data;if(data.payment.status==='submitted'&&!data.payment.screenshot){paymentDraft.reference=data.payment.reference||'';paymentDraft.description=data.payment.description||''}error.value=''}}catch(e){if(started===epoch)error.value=e instanceof Error?e.message:'订单读取失败'}finally{if(started===epoch)loading.value=false}}
async function submitPayment(){
  if(!order.value||saving.value)return
  if(!paymentDraft.reference.trim()){error.value='请填写手动付款流水号。';return}
  if(!screenshotFile.value){error.value='请上传付款截图。';return}
  saving.value=true;error.value='';const owner=auth.session.value?.account.id
  try{const screenshot=await encodePaymentScreenshot(screenshotFile.value);const data=await orderApi.manualPayment(order.value.id,{reference:paymentDraft.reference.trim(),description:paymentDraft.description.trim(),screenshot});if(owner===auth.session.value?.account.id){order.value=data;clearScreenshot();await router.replace({name:'orders'})}}
  catch(e){error.value=e instanceof Error?e.message:'付款信息提交失败'}finally{saving.value=false}
}
onMounted(()=>{void load();timer=setInterval(()=>{if(!document.hidden&&!saving.value)void load()},15000)})
onUnmounted(()=>{epoch++;clearInterval(timer);clearScreenshot()})
</script>
<template>
  <section class="admin-page order-detail-page">
    <div class="admin-page-heading"><div class="form-title"><RouterLink :to="{ name: 'orders' }" aria-label="返回订单列表">←</RouterLink><h1>订单详情与履约</h1></div><RouterLink class="plain-button" :to="{ name: 'orders' }">返回列表</RouterLink></div>
    <p class="preview-note">仅支持手动建单和手动付款。付款资料提交后，由已有管理端确认到账并审核；审核通过后，本后台调用履约系统建单。</p><p v-if="error" class="admin-error" role="alert">{{error}}</p>
    <template v-if="order">
      <ol class="order-flow" aria-label="订单处理流程"><li v-for="(label, index) in ['手工建单', '手动付款', '收款审核', '创建履约', '查看履约']" :key="label" :class="{ done: index < step, current: index === step }" :aria-current="index === step ? 'step' : undefined"><span>{{ index < step ? '✓' : index + 1 }}</span><strong>{{ label }}</strong></li></ol>
      <div class="order-overview"><div><p class="detail-eyebrow">{{ order.providerName }} · {{ order.operatorName }}</p><h2>外部订单号 {{ order.referenceId || '未填写' }}</h2><p>结算订单号：{{ order.id }}</p></div><div class="order-amount"><span>订单应付金额</span><strong>{{ money(order.payPrice) }}</strong><span class="order-state-pill">{{ orderStage(order) }}</span></div></div>

      <div class="detail-columns">
        <section class="detail-card payment-card"><header><h2>手动付款信息</h2><span class="detail-badge" :class="{complete:order.payment.status==='paid'}">{{order.payment.status==='paid'?'已确认收款':order.payment.status==='submitted'?'待核对到账':'待付款'}}</span></header>
          <dl class="detail-fields"><dt>服务商</dt><dd>{{order.providerName}}</dd><dt>建单人员</dt><dd>{{order.operatorName}}</dd><dt>付款人员</dt><dd>{{order.payment.payerName||auth.session.value?.account.personName}}</dd><dt>收款时间</dt><dd>{{date(order.payment.paidAt)}}</dd></dl>
          <form v-if="order.payment.status==='unpaid'||(order.payment.status==='submitted'&&!order.payment.screenshot)" class="manual-payment-form" @submit.prevent="submitPayment"><p class="detail-help">请按约定渠道手动付款，付款后填写流水号并上传付款截图，供管理端核对。提交资料不会将订单标记为已收款。</p><label>付款流水号<input v-model="paymentDraft.reference" aria-label="付款流水号" maxlength="120" placeholder="填写银行或支付平台流水号" :readonly="order.payment.status==='submitted'" :disabled="saving"></label><label>付款截图 <span class="required-mark">*</span><input type="file" required aria-label="付款截图" accept="image/jpeg,image/png,image/webp" :disabled="saving" @change="selectScreenshot"></label><p class="detail-help">支持 JPG、PNG、WebP，单张不超过 5 MB，请确保金额、时间和流水号清晰。</p><a v-if="screenshotPreview" :href="screenshotPreview" target="_blank" rel="noopener" class="payment-screenshot-link"><img :src="screenshotPreview" alt="待提交的付款截图预览"></a><label>付款说明<textarea v-model="paymentDraft.description" aria-label="付款说明" maxlength="1000" rows="3" placeholder="选填" :readonly="order.payment.status==='submitted'" :disabled="saving"></textarea></label><button class="mint-button" type="submit" :disabled="saving">{{saving?'正在上传并提交…':order.payment.status==='submitted'?'补充付款截图':'提交手动付款信息'}}</button></form>
          <template v-else><dl class="detail-fields"><dt>付款流水号</dt><dd>{{order.payment.reference||'由管理端确认'}}</dd><dt>付款说明</dt><dd>{{order.payment.description||'无'}}</dd><dt>提交时间</dt><dd>{{date(order.payment.submittedAt)}}</dd></dl><a v-if="screenshotUrl" :href="screenshotUrl" target="_blank" rel="noopener" class="payment-screenshot-link"><img :src="screenshotUrl" alt="已提交的付款截图"><span>查看付款截图原图 ↗</span></a><p v-if="order.payment.status==='submitted'" class="review-pending" role="status">付款信息已提交，等待管理端核对到账。</p></template>
        </section>
        <section class="detail-card fulfillment-card"><header><h2>履约情况</h2><span class="detail-badge" :class="{ complete: order.fulfillment.status === 'delivered' }">{{ fulfillmentLabels[order.fulfillment.status] }}</span></header>
          <p v-if="order.external.status !== 'created'" class="fulfillment-empty">确认收款、管理端审核通过并创建履约订单后，这里展示履约进度。</p>
          <template v-else><dl class="detail-fields"><dt>履约订单号</dt><dd>{{ order.external.timelyOrderId }}</dd><dt>当前状态</dt><dd>{{order.fulfillment.sourceStatus||fulfillmentLabels[order.fulfillment.status]}}</dd><dt>最近更新</dt><dd>{{ date(order.fulfillment.updatedAt) }}</dd><dt>最近同步</dt><dd>{{ date(order.fulfillment.syncedAt) }}</dd></dl><FulfillmentInfo :fulfillment="order.fulfillment"/><p class="detail-help">后台定时同步配送订单状态、履约备注及配送信息。</p><p v-if="order.fulfillment.syncMessage" class="detail-help">{{order.fulfillment.syncMessage}}</p><p v-if="order.fulfillment.status==='delivered'" class="fulfillment-complete" role="status">✓ 订单已送达。</p></template>
        </section>
      </div>
      <section class="detail-card review-card"><header><h2>管理端收款审核</h2><span class="detail-badge" :class="{complete:order.review.status==='approved'}">{{reviewLabel}}</span></header><dl class="detail-fields"><dt>审核人员</dt><dd>{{order.review.reviewerName||'—'}}</dd><dt>审核时间</dt><dd>{{date(order.review.reviewedAt)}}</dd><dt>审核说明</dt><dd>{{order.review.reason||'—'}}</dd><dt>履约订单号</dt><dd>{{order.external.timelyOrderId||'审核通过后创建'}}</dd></dl><p v-if="order.review.status==='pending'" class="review-pending" role="status">已确认收款，等待管理端审核结果。发起方不能自行审核。</p><p v-if="order.review.status==='rejected'" class="review-rejected" role="status">审核未通过：{{order.review.reason||'请联系管理端核实'}}。此状态不会自动退款或要求再次付款。</p><p v-if="order.review.status==='approved'&&order.external.status!=='created'" class="review-pending" role="status">{{order.external.message||'审核通过，等待后台完成履约建单。'}}</p><p class="detail-help">由已有管理端通过接口写入收款及审核结果，Web 仅展示。</p></section>
      <section class="detail-card"><header><h2>订单信息</h2><span>{{ order.platformName }}</span></header><dl class="detail-fields order-info-fields"><dt>城市 / 品牌</dt><dd>{{ order.cityName }} / {{ order.brandName }}</dd><dt>收件信息</dt><dd>{{ order.contacts }}</dd><dt>用户备注</dt><dd>{{ order.messages || '无' }}</dd><dt>送达时限</dt><dd>{{ order.arrivedTime }} 分钟</dd><dt>创建时间</dt><dd>{{ date(order.createdAt) }}</dd></dl><ul class="detail-items"><li v-for="(item, index) in order.items" :key="index"><div class="order-item-identity"><ProductThumbnail :src="item.imageUrl" :name="item.itemName"/><div class="order-item-copy"><strong>{{ item.itemName }}</strong><span>{{ item.spec || '无规格' }}<template v-if="item.upc"> · UPC：{{item.upc}}</template></span></div></div><span>{{ money(item.salesPrice) }} × {{ item.quantity }}</span><strong>{{ money(item.salesPrice * item.quantity) }}</strong></li></ul></section>
      <section class="detail-card event-card"><header><h2>订单进度记录</h2><span>后台订单记录</span></header><ol class="order-events"><li v-for="event in order.events" :key="event.id"><time>{{ date(event.time) }}</time><div><strong>{{ event.title }}</strong><p>{{ event.description }}</p></div></li></ol></section>
    </template>
    <div v-else class="order-empty"><p>{{loading?'正在读取订单…':'当前账号下不存在此订单。'}}</p><RouterLink class="mint-button" :to="{ name: 'create-order' }">新建订单</RouterLink></div>
  </section>
</template>
