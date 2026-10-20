<script setup lang="ts">
import type { FulfillmentState } from '../domain/orders'
defineProps<{fulfillment:FulfillmentState;compact?:boolean}>()
const date=(value?:number)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):''
</script>
<template>
  <section class="fulfillment-snapshot" :class="{compact}" aria-label="履约备注与配送信息">
    <h3 v-if="!compact">履约备注</h3>
    <p v-if="fulfillment.messages" class="fulfillment-note">配送订单留言：{{fulfillment.messages}}</p>
    <div v-for="(memo,index) in (compact?fulfillment.memos?.slice(0,1):fulfillment.memos)" :key="memo.id||index" class="fulfillment-note"><p>{{memo.content}}</p><time v-if="memo.createdAt">{{date(memo.createdAt)}}</time></div>
    <p v-if="!compact&&!fulfillment.messages&&!fulfillment.memos?.length" class="fulfillment-muted">暂无履约备注</p>
    <h3 v-if="!compact">配送信息</h3>
    <div v-for="(delivery,index) in fulfillment.deliveries" :key="delivery.id||index" class="delivery-snapshot">
      <strong>{{delivery.channel}} · {{delivery.status}}</strong>
      <p v-if="delivery.orderNo">物流单号：{{delivery.orderNo}}</p>
      <p v-if="delivery.riderName||delivery.riderPhone">配送员：{{delivery.riderName||'待分配'}} {{delivery.riderPhone}}</p>
      <template v-if="!compact"><p>取件信息：{{[delivery.fromName,delivery.fromPhone,delivery.fromAddress].filter(Boolean).join(' · ')||'待补充'}}</p><p>收件信息：{{[delivery.toName,delivery.toPhone,delivery.toAddress].filter(Boolean).join(' · ')||'待补充'}}</p></template>
      <p v-if="delivery.tips">{{delivery.tips}}</p><p v-if="delivery.errorMessage" class="fulfillment-warning">{{delivery.errorMessage}}</p>
    </div>
    <p v-if="!compact&&!fulfillment.deliveries?.length" class="fulfillment-muted">暂无配送信息，履约方发起配送后自动同步。</p>
    <p v-if="fulfillment.errorMessage" class="fulfillment-warning">{{fulfillment.errorMessage}}</p>
  </section>
</template>
<style scoped>
.fulfillment-snapshot{font-size:12px;line-height:1.8;overflow-wrap:anywhere}.fulfillment-snapshot h3{font-size:12px;font-weight:500;color:#555;margin:18px 0 8px}.fulfillment-note,.delivery-snapshot{margin:8px 0;padding:9px 11px;background:#f7faf9;border:1px solid #edf2ef;border-radius:3px;white-space:pre-wrap}.fulfillment-note p,.delivery-snapshot p{margin:0}.fulfillment-note time,.fulfillment-muted{font-size:11px;color:#999}.delivery-snapshot strong{font-size:12px;font-weight:500;color:#498f7e}.fulfillment-warning{color:#b24d43}.compact{font-size:11px}.compact .fulfillment-note,.compact .delivery-snapshot{padding:4px 0;background:none;border:0;margin:5px 0}.compact .delivery-snapshot strong{font-size:11px}
</style>
