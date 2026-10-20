<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from './state/auth'
const router = useRouter()
let timer: ReturnType<typeof setInterval>
function checkSession() {
  if (auth.session.value && !document.hidden) void auth.refresh().catch(() => {})
}
watch(auth.session, (session) => {
  if (!session && router.currentRoute.value.meta.requiresAuth) void router.replace({ name: 'login' })
})
onMounted(() => { timer = setInterval(checkSession, 30000); window.addEventListener('focus', checkSession); document.addEventListener('visibilitychange', checkSession) })
onUnmounted(() => { clearInterval(timer); window.removeEventListener('focus', checkSession); document.removeEventListener('visibilitychange', checkSession) })
</script>
<template><div v-if="!auth.initialized.value" class="bootstrap-loading" role="status">正在连接工作空间…</div><RouterView v-else /></template>
