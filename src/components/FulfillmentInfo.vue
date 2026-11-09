<script setup lang="ts">
import { computed } from 'vue'
import type { DeliveryInfo, FulfillmentState } from '../domain/orders'

const props = defineProps<{ fulfillment: FulfillmentState; compact?: boolean }>()

function platform(delivery: DeliveryInfo) {
  if (delivery.status === '自配送' && (!delivery.channel || ['配送平台', '未知'].includes(delivery.channel))) return '自配送'
  return delivery.channel
}

const deliveries = computed(() => props.fulfillment.status === 'delivering'
  ? (props.fulfillment.deliveries ?? []).filter(delivery =>
      platform(delivery) || delivery.orderNo || delivery.riderName || delivery.riderPhone)
  : [])
</script>

<template>
  <section v-if="deliveries.length" class="fulfillment-snapshot" :class="{ compact }" aria-label="配送信息">
    <h3 v-if="!compact">配送信息</h3>
    <dl v-for="(delivery, index) in deliveries" :key="delivery.id || index" class="delivery-snapshot">
      <template v-if="platform(delivery)"><dt>配送平台</dt><dd>{{ platform(delivery) }}</dd></template>
      <template v-if="delivery.orderNo"><dt>运单号</dt><dd>{{ delivery.orderNo }}</dd></template>
      <template v-if="delivery.riderName"><dt>配送员</dt><dd>{{ delivery.riderName }}</dd></template>
      <template v-if="delivery.riderPhone"><dt>配送员电话</dt><dd>{{ delivery.riderPhone }}</dd></template>
    </dl>
  </section>
</template>

<style scoped>
.fulfillment-snapshot { font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.fulfillment-snapshot h3 { font-size: 12px; font-weight: 500; color: #555; margin: 18px 0 8px; }
.delivery-snapshot { display: grid; grid-template-columns: auto 1fr; gap: 1px 9px; margin: 8px 0; padding: 9px 11px; background: #f7faf9; border: 1px solid #edf2ef; border-radius: 3px; }
.delivery-snapshot dt { color: #666; }
.delivery-snapshot dd { margin: 0; }
.compact { font-size: 11px; }
.compact .delivery-snapshot { padding: 4px 0; background: none; border: 0; margin: 5px 0; }
</style>
