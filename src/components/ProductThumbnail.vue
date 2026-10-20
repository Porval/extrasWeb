<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props=defineProps<{src?:string;name:string}>()
const failed=ref(false)
const source=computed(()=>{
  if(!props.src)return ''
  try{const url=new URL(props.src);return url.protocol==='https:'&&!url.username&&!url.password?url.href:''}catch{return ''}
})
watch(source,()=>{failed.value=false})
</script>
<template>
  <span class="order-product-thumbnail"><img v-if="source&&!failed" :src="source" :alt="`${name}商品图`" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="failed=true"><span v-else>暂无图</span></span>
</template>
<style scoped>
.order-product-thumbnail{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;box-sizing:border-box;overflow:hidden;border:1px solid #e6ece8;border-radius:4px;background:#fff;color:#aaa;font-size:10px;line-height:1.4}
.order-product-thumbnail img{display:block;width:100%;height:100%;object-fit:contain}
</style>
