<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth } from '../state/auth'
import ProductThumbnail from '../components/ProductThumbnail.vue'
import FulfillmentInfo from '../components/FulfillmentInfo.vue'
import { ApiError } from '../api/http'
import { orderApi } from '../api/orders'
import { money } from '../domain/order-form'
import { fulfillmentCreation, orderStage, providerOrderEvents, refundStatusLabels } from '../domain/orders'
import { encodePaymentScreenshot, validatePaymentScreenshot } from '../domain/payment-screenshot'
import type { ProviderOrderDetail } from '../domain/orders'
const route=useRoute(),router=useRouter(),order=ref<ProviderOrderDetail>(),loading=ref(true),saving=ref(false),error=ref('')
const quotePending=computed(()=>order.value?.quote?.status==='pending')
const canSubmitPayment=computed(()=>!quotePending.value&&(order.value?.payment.status==='unpaid'||(order.value?.payment.status==='submitted'&&!order.value.payment.screenshot)))
const flowLabels=computed(()=>['手工建单',...(order.value?.quote?['管理端报价']:[]),'手动付款','确认到账','自动建单','查看履约'])
const creation = computed(() => order.value && fulfillmentCreation(order.value))
const currentStage = computed(() => order.value && orderStage(order.value))
const events = computed(() => order.value ? providerOrderEvents(order.value) : [])
const canRequestRefund = computed(() => order.value?.canRequestRefund === true && !order.value.refund)
const refundOpen = ref(false), refundReason = ref(''), refundError = ref('')
let refundAttempt: { reason: string; key: string } | undefined
const paymentDraft=reactive({reference:'',description:''})
const paymentDraftDirty=ref(false)
const paymentReturned=computed(()=>order.value?.payment.status==='unpaid'&&Boolean(order.value.payment.rejection))
let draftIdentity='',draftSource=''
function markPaymentDraftEdited(){paymentDraftDirty.value=true}
function acceptOrder(data:ProviderOrderDetail){
  const identity=JSON.stringify([auth.session.value?.account.id,data.id])
  if(identity!==draftIdentity){
    draftIdentity=identity;draftSource='';paymentDraftDirty.value=false;clearScreenshot()
    refundOpen.value = false; refundReason.value = ''; refundError.value = ''; refundAttempt = undefined
  }
  if (data.refund) {
    refundOpen.value = false; refundError.value = ''; refundAttempt = undefined
  }
  const source=JSON.stringify([data.payment.noteId,data.payment.status,data.payment.rejection?.noteId,data.payment.rejection?.rejectedAt])
  if(source!==draftSource&&!paymentDraftDirty.value){paymentDraft.reference=data.payment.reference||'';paymentDraft.description=data.payment.description||''}
  draftSource=source
  order.value=data
}
const screenshotFile=ref<File>(),screenshotPreview=ref('')
const screenshotUrl=computed(()=>order.value?.payment.screenshot ? `/api/orders/${encodeURIComponent(order.value.id)}/payment-screenshot` : '')
function clearScreenshot(){if(screenshotPreview.value)URL.revokeObjectURL(screenshotPreview.value);screenshotPreview.value='';screenshotFile.value=undefined}
function setScreenshot(file: File) {
  if (saving.value) return
  try {
    const extension = !file.type && /\.(jpe?g|png|webp)$/i.exec(file.name)?.[1].toLowerCase()
    if (extension) {
      const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
      file = new File([file], file.name, { type: contentType, lastModified: file.lastModified })
    }
    validatePaymentScreenshot(file)
    const preview = URL.createObjectURL(file)
    clearScreenshot()
    markPaymentDraftEdited()
    screenshotFile.value = file
    screenshotPreview.value = preview
    error.value = ''
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请选择有效图片。'
  }
}
function selectScreenshot(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) setScreenshot(file)
  input.value = ''
}
function dropScreenshot(event: DragEvent) {
  if (saving.value || !event.dataTransfer) return
  const transfer = event.dataTransfer
  const files = transfer.files?.length ? Array.from(transfer.files) : Array.from(transfer.items ?? [])
    .filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(file => file !== null)
  if (files.length !== 1) {
    error.value = files.length ? '请一次拖入一张付款截图。' : '请拖入付款截图文件，或点击选择文件。'
    return
  }
  setScreenshot(files[0])
}
const step=computed(()=>{
  if (!order.value || quotePending.value) return 1
  const offset=order.value.quote?1:0
  if (order.value.payment.status==='unpaid') return offset+1
  if (order.value.payment.status==='submitted') return offset+2
  if (order.value.external.status!=='created') return offset+3
  return offset+(order.value.fulfillment.status==='delivered'?5:4)
})
let epoch=0,timer:ReturnType<typeof setInterval>|undefined
const date=(value?:number)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—'
async function load(){const started=++epoch,owner=auth.session.value?.account.id;try{const data=await orderApi.get(String(route.params.id));if(started===epoch&&owner===auth.session.value?.account.id){acceptOrder(data);error.value=''}}catch(e){if(started===epoch)error.value=e instanceof Error?e.message:'订单读取失败'}finally{if(started===epoch)loading.value=false}}
async function submitPayment(){
  if(!order.value||saving.value||!canSubmitPayment.value)return
  if(!screenshotFile.value){error.value=paymentReturned.value?'请重新选择付款截图后再提交。':'请上传付款截图。';return}
  const current=order.value,file=screenshotFile.value
  const input={reference:paymentDraft.reference.trim(),description:paymentDraft.description.trim(),...(paymentReturned.value?{previousNoteId:current.payment.rejection?.noteId||current.payment.noteId}: {})}
  saving.value=true;error.value='';const owner=auth.session.value?.account.id
  try{const screenshot=await encodePaymentScreenshot(file);const data=await orderApi.manualPayment(current.id,{...input,screenshot});if(owner===auth.session.value?.account.id){order.value=data;paymentDraftDirty.value=false;clearScreenshot();await router.replace({name:'orders'})}}
  catch(e){error.value=e instanceof Error?e.message:'付款信息提交失败'}finally{saving.value=false}
}
async function submitRefund() {
  const id = order.value?.id
  const owner = auth.session.value?.account.id
  if (!id || id !== String(route.params.id) || !owner || !canRequestRefund.value || saving.value) return
  const reason = refundReason.value.trim()
  if (!reason || reason.length > 200) {
    refundError.value = '请填写 1 至 200 字的退款原因。'
    return
  }
  if (refundAttempt?.reason !== reason) refundAttempt = { reason, key: crypto.randomUUID() }
  refundError.value = ''
  saving.value = true
  const started = ++epoch
  const isCurrent = () => started === epoch && owner === auth.session.value?.account.id && id === String(route.params.id)
  try {
    const updated = await orderApi.requestRefund(id, reason, refundAttempt.key)
    if (isCurrent()) acceptOrder(updated)
  } catch (failure) {
    if (isCurrent()) {
      refundError.value = failure instanceof Error ? failure.message : '退款申请提交失败，请重试。'
      if (failure instanceof ApiError && failure.status === 409) void load()
    }
  } finally {
    saving.value = false
  }
}
onMounted(()=>{void load();timer=setInterval(()=>{if(!document.hidden&&!saving.value)void load()},15000)})
onUnmounted(()=>{epoch++;clearInterval(timer);clearScreenshot()})
</script>
<template>
  <section class="admin-page order-detail-page">
    <div class="admin-page-heading"><div class="form-title"><RouterLink :to="{ name: 'orders' }" aria-label="返回订单列表">←</RouterLink><h1>订单详情与履约</h1></div><RouterLink class="plain-button" :to="{ name: 'orders' }">返回列表</RouterLink></div>
    <p class="preview-note">{{order?.quote?'报价完成后，按报价金额手动付款并提交资料。':'手动付款后，请提交付款资料。'}}管理端确认到账后，系统自动创建履约订单。</p><p v-if="error" class="admin-error" role="alert">{{error}}</p>
    <template v-if="order">
      <ol class="order-flow" :class="{'has-quote':order.quote}" aria-label="订单处理流程"><li v-for="(label, index) in flowLabels" :key="label" :class="{ done: index < step, current: index === step }" :aria-current="index === step ? 'step' : undefined"><span>{{ index < step ? '✓' : index + 1 }}</span><strong>{{ label }}</strong></li></ol>
      <div class="order-overview"><div><p class="detail-eyebrow">{{ order.providerName }} · {{ order.operatorName }}</p><h2>外部订单号 {{ order.referenceId || '未填写' }}</h2><p>结算订单号：{{ order.id }}</p></div><div class="order-amount"><span>订单应付金额</span><strong v-if="!quotePending">{{ money(order.payPrice) }}</strong><strong v-else>—</strong><span class="order-state-pill" :class="{returned:paymentReturned}">{{ currentStage }}</span></div></div>

      <section v-if="order.quote" class="detail-card quote-card" aria-label="管理端报价" aria-live="polite">
        <header><h2>管理端报价</h2><span class="detail-badge" :class="{complete:!quotePending}">{{quotePending?'待报价':'已报价'}}</span></header>
        <p v-if="order.quote.status==='pending'" class="review-pending">订单已提交。报价完成后，此处会显示应付金额和付款入口。</p>
        <dl v-else class="detail-fields"><dt>报价时间</dt><dd>{{date(order.quote.quotedAt)}}</dd><dt>报价人员</dt><dd>{{order.quote.quotedBy}}</dd><dt>报价备注</dt><dd class="quote-note">{{order.quote.note||'—'}}</dd></dl>
      </section>

      <div v-if="!quotePending" class="detail-columns">
        <section class="detail-card payment-card"><header><h2>手动付款信息</h2><span class="detail-badge" :class="{complete:order.payment.status==='paid',returned:paymentReturned}">{{ order.payment.status === 'paid' ? '已确认到账' : currentStage }}</span></header>
          <dl class="detail-fields"><dt>服务商</dt><dd>{{order.providerName}}</dd><dt>建单人员</dt><dd>{{order.operatorName}}</dd><dt>付款人员</dt><dd>{{order.payment.payerName||auth.session.value?.account.personName}}</dd><dt>{{order.payment.confirmedAt ? '确认到账时间' : '收款时间'}}</dt><dd>{{date(order.payment.confirmedAt ?? order.payment.paidAt)}}</dd></dl>
          <div v-if="paymentReturned&&order.payment.rejection" class="payment-returned-notice" role="status">
            <strong>付款资料已退回</strong><p>退回原因：{{order.payment.rejection.reason}}</p>
            <p>请核对实际付款记录，修改资料后重新提交。本次只更新付款资料，请勿重复付款。</p>
            <small>{{order.payment.rejection.reviewerName}} · {{date(order.payment.rejection.rejectedAt)}}</small>
          </div>
          <section v-if="paymentReturned" class="previous-payment-proof" aria-label="上次提交的付款资料">
            <h3>上次提交的付款资料 · 仅供核对</h3>
            <dl class="detail-fields"><dt>付款流水号</dt><dd>{{order.payment.reference||'未填写'}}</dd><dt>付款说明</dt><dd>{{order.payment.description||'无'}}</dd><dt>提交时间</dt><dd>{{date(order.payment.submittedAt)}}</dd></dl>
            <a v-if="screenshotUrl" :href="screenshotUrl" target="_blank" rel="noopener" class="payment-screenshot-link"><img :src="screenshotUrl" alt="上次提交的付款截图（仅供核对）"><span>查看上次付款截图原图 ↗</span></a>
          </section>
          <form v-if="canSubmitPayment" class="manual-payment-form" novalidate @submit.prevent="submitPayment">
            <p v-if="paymentReturned" class="detail-help">核对上次资料后，可修改流水号和说明，并重新选择清晰的付款截图。旧截图只作参考，不会用于本次重新提交。</p>
            <p v-else class="detail-help">请按约定渠道手动付款<template v-if="order.quote">，金额以管理端报价为准</template>。付款后上传截图，供管理端核对到账。</p>
            <label>付款流水号（选填）<input v-model="paymentDraft.reference" aria-label="付款流水号" maxlength="120" placeholder="可填写银行或支付平台流水号" :readonly="order.payment.status==='submitted'" :disabled="saving" @input="markPaymentDraftEdited"></label>
            <label class="payment-screenshot-drop" @dragover.prevent @drop.prevent.stop="dropScreenshot">
              {{ paymentReturned ? '重新选择付款截图' : '付款截图' }} <span class="required-mark">*</span>
              <span id="payment-screenshot-help" class="detail-help">可从微信或文件夹拖入一张图片，也可点击选择文件。支持 JPG、PNG、WebP，单张不超过 5 MB。请确保付款金额和时间清晰可见。</span>
              <input type="file" required aria-label="付款截图" aria-describedby="payment-screenshot-help" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" :disabled="saving" @change="selectScreenshot">
              <span v-if="screenshotFile" class="detail-help" role="status">已选择 {{ screenshotFile.name }}</span>
            </label>
            <a v-if="screenshotPreview" :href="screenshotPreview" target="_blank" rel="noopener" class="payment-screenshot-link"><img :src="screenshotPreview" alt="待提交的付款截图预览"></a>
            <label>付款说明<textarea v-model="paymentDraft.description" aria-label="付款说明" maxlength="1000" rows="3" placeholder="选填" :readonly="order.payment.status==='submitted'" :disabled="saving" @input="markPaymentDraftEdited"></textarea></label>
            <button class="mint-button" type="submit" :disabled="saving">{{saving?'正在上传并提交…':paymentReturned?'重新提交付款资料':order.payment.status==='submitted'?'补充付款截图':'提交手动付款信息'}}</button>
          </form>
          <template v-else><dl class="detail-fields"><dt>付款流水号</dt><dd>{{order.payment.reference||'未填写'}}</dd><dt>付款说明</dt><dd>{{order.payment.description||'无'}}</dd><dt>提交时间</dt><dd>{{date(order.payment.submittedAt)}}</dd></dl><a v-if="screenshotUrl" :href="screenshotUrl" target="_blank" rel="noopener" class="payment-screenshot-link"><img :src="screenshotUrl" alt="已提交的付款截图"><span>查看付款截图原图 ↗</span></a><p v-if="order.payment.status==='submitted'" class="review-pending" role="status">付款信息已提交，等待管理端核对到账。</p></template>
          <details v-if="order.payment.rejections?.length" class="payment-return-history"><summary>付款资料退回记录（{{order.payment.rejections.length}}）</summary><ol><li v-for="entry in order.payment.rejections" :key="entry.noteId"><strong>{{entry.reason}}</strong><span>{{entry.reviewerName}} · {{date(entry.rejectedAt)}}</span></li></ol></details>
        </section>
        <section class="detail-card fulfillment-card"><header><h2>履约情况</h2><span v-if="order.external.status === 'created' || creation" class="detail-badge" :class="{ complete: currentStage === '已完成' }">{{ currentStage }}</span></header>
          <p v-if="order.external.status !== 'created'" class="fulfillment-empty">
            {{ creation?.message || '确认到账后，系统会自动创建履约订单并同步履约进度。' }}
          </p>
          <template v-else><dl v-if="order.external.timelyOrderId" class="detail-fields"><dt>履约订单号</dt><dd>{{ order.external.timelyOrderId }}</dd></dl><FulfillmentInfo :fulfillment="order.fulfillment"/><p v-if="currentStage === '已完成'" class="fulfillment-complete" role="status">✓ 订单已完成。</p></template>
        </section>
      </div>
      <section v-if="canRequestRefund || order.refund || refundError" class="detail-card refund-card" aria-label="退款申请">
        <header>
          <h2>退款申请</h2>
          <span v-if="order.refund" class="detail-badge" role="status">{{ refundStatusLabels[order.refund.status] }}</span>
          <button v-else-if="canRequestRefund && !refundOpen" class="plain-button" type="button" @click="refundOpen = true">申请退款</button>
        </header>
        <dl v-if="order.refund" class="detail-fields">
          <dt>申请原因</dt><dd>{{ order.refund.reason }}</dd>
          <dt>申请时间</dt><dd>{{ date(order.refund.requestedAt) }}</dd>
          <template v-if="order.refund.markedAt"><dt>退款标识时间</dt><dd>{{ date(order.refund.markedAt) }}</dd></template>
          <template v-if="order.refund.confirmedAt"><dt>履约确认时间</dt><dd>{{ date(order.refund.confirmedAt) }}</dd></template>
          <template v-if="order.refund.initiatedAt"><dt>退款发起时间</dt><dd>{{ date(order.refund.initiatedAt) }}</dd></template>
        </dl>
        <p v-if="order.refund?.message" class="detail-help">{{ order.refund.message }}</p>
        <p v-if="order.refund?.status === 'initiated'" class="detail-help">实际到账请以收款记录为准。</p>
        <form v-if="canRequestRefund && refundOpen" class="refund-request-form" @submit.prevent="submitRefund">
          <p class="detail-help">提交申请后，管理端会核对履约进度并处理退款。</p>
          <label>退款原因<textarea v-model="refundReason" maxlength="200" rows="3" :disabled="saving"></textarea></label>
          <button class="mint-button" type="submit" :disabled="saving">{{ saving ? '正在提交…' : '提交退款申请' }}</button>
          <button class="plain-button" type="button" :disabled="saving" @click="refundOpen = false; refundError = ''">取消</button>
        </form>
        <p v-if="refundError" class="admin-error" role="alert">{{ refundError }}</p>
      </section>
      <section class="detail-card"><header><h2>订单信息</h2><span>{{ order.platformName }}</span></header><dl class="detail-fields order-info-fields"><dt>城市 / 品牌</dt><dd>{{ order.cityName }} / {{ order.brandName }}</dd><dt>收件信息</dt><dd>{{ order.contacts }}</dd><dt>用户备注</dt><dd>{{ order.messages || '无' }}</dd><dt>送达时限</dt><dd>{{ order.arrivedTime }} 分钟</dd><dt>创建时间</dt><dd>{{ date(order.createdAt) }}</dd></dl><ul class="detail-items"><li v-for="(item, index) in order.items" :key="index"><div class="order-item-identity"><ProductThumbnail :src="item.imageUrl" :name="item.itemName"/><div class="order-item-copy"><strong>{{ item.itemName }}</strong><span>{{ item.spec || '无规格' }}<template v-if="item.upc"> · UPC：{{item.upc}}</template></span></div></div><span>{{ order.quote ? '参考单价 ' : '' }}{{ money(item.salesPrice) }} × {{ item.quantity }}</span><strong>{{ money(item.salesPrice * item.quantity) }}</strong></li></ul></section>
      <section v-if="events.length" class="detail-card event-card"><header><h2>订单进度记录</h2></header><ol class="order-events"><li v-for="event in events" :key="event.id"><time>{{ date(event.time) }}</time><div><strong>{{ event.title }}</strong><p v-if="event.description">{{ event.description }}</p></div></li></ol></section>
    </template>
    <div v-else class="order-empty"><p>{{loading?'正在读取订单…':'当前账号下不存在此订单。'}}</p><RouterLink class="mint-button" :to="{ name: 'create-order' }">新建订单</RouterLink></div>
  </section>
</template>

<style scoped>
.manual-payment-form .payment-screenshot-drop {
  padding: 12px;
  border: 1px dashed #95bfae;
  border-radius: 4px;
  background: #f7fbf9;
}
.payment-screenshot-drop:focus-within { outline: 2px solid #498f7e; outline-offset: 2px; }
.payment-screenshot-drop .detail-help { display: block; margin-top: 6px; }
.refund-request-form label {
  display: grid;
  gap: 7px;
  margin: 14px 0;
  font-size: 12px;
  color: #777;
}
.refund-request-form textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid #ddd;
  border-radius: 3px;
  resize: vertical;
  font: inherit;
  color: #444;
}
.refund-request-form .plain-button { margin-inline-start: 8px; }
</style>
