<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../state/auth'
const router = useRouter()
const account = computed(() => auth.session.value?.account)
const leaving = ref(false)
const error = ref('')
async function logout() {
  if (leaving.value) return
  leaving.value = true; error.value = ''
  try { await auth.logout(); await router.replace({ name: 'login' }) }
  catch (e) { error.value = e instanceof Error ? e.message : '退出失败，请重试。' }
  finally { leaving.value = false }
}
</script>
<template>
  <main v-if="account" class="admin-shell">
    <aside class="admin-sidebar"><RouterLink class="admin-brand" :to="{name:'orders'}">及时达管理后台</RouterLink><nav aria-label="后台导航"><RouterLink :to="{name:'orders'}" :class="{ selected: ['orders','create-order','order-detail'].includes(String($route.name)) }"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 10 11-5v14L4 14v-4Zm11-3 4 2v6l-4 2M7 15v5h4v-3" stroke="currentColor" stroke-width="1.5"/></svg>及时达订单</RouterLink><RouterLink :to="{name:'workspace'}" :class="{ selected: $route.name === 'workspace' }"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h16v16H4zM8 9h8M8 14h8" stroke="currentColor" stroke-width="1.5"/></svg>我的账户</RouterLink></nav><span class="admin-version">版本：0.1.0</span></aside>
    <div class="admin-main"><header class="admin-topbar"><span>{{ account.providerName }} · 及时达后台</span><div><span class="identity-role">{{ account.role === 'admin' ? '管理员' : '服务商成员' }}</span><span>已登录：{{ account.personName }}</span><button :disabled="leaving" @click="logout">{{ leaving ? '正在退出…' : '退出' }}</button></div></header><p v-if="error || auth.message.value" class="admin-error" role="alert">{{ error || auth.message.value }}</p><RouterView /><footer class="admin-footer">及时达 · 管理后台</footer></div>
  </main>
</template>
