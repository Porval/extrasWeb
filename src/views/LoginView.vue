<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authApi, ApiError } from '../api/auth'
import { auth } from '../state/auth'
const router = useRouter()
const mobile = ref('')
const code = ref('')
const sending = ref(false)
const signingIn = ref(false)
const feedback = ref('')
const feedbackKind = ref<'success' | 'error'>('success')
const development = ref(false)
const devCode = ref('')
const codeInput = ref<HTMLInputElement>()
const now = ref(Date.now())
const cooldownUntil = ref(0)
let ticker: ReturnType<typeof setInterval>
const cooldownKey = 'extrasWeb.smsCooldownUntil'
const seconds = computed(() => Math.max(0, Math.ceil((cooldownUntil.value - now.value) / 1000)))
const busy = computed(() => sending.value || signingIn.value)
const statusMessage = computed(() => feedback.value || auth.message.value)
function fail(message: string) { feedback.value = message; feedbackKind.value = 'error' }
function rememberCooldown(seconds: number) {
  now.value = Date.now(); cooldownUntil.value = now.value + seconds * 1000
  try { sessionStorage.setItem(cooldownKey, String(cooldownUntil.value)) } catch { /* Storage can be disabled. */ }
}
async function sendCode() {
  if (busy.value || seconds.value > 0) return
  const phone = mobile.value.trim()
  if (!/^1[3-9]\d{9}$/.test(phone)) return fail('请输入有效的 11 位手机号。')
  sending.value = true; feedback.value = ''; devCode.value = ''; code.value = ''
  try {
    const result = await authApi.requestCode(phone)
    rememberCooldown(result.retryAfter)
    feedbackKind.value = 'success'; feedback.value = result.message
    if (development.value && result.devCode) { devCode.value = result.devCode; code.value = result.devCode }
    sending.value = false
    await nextTick()
    codeInput.value?.focus()
  } catch (error) {
    fail(error instanceof Error ? error.message : '验证码发送失败，请稍后重试。')
    if (error instanceof ApiError && error.status === 429) rememberCooldown(60)
  } finally { sending.value = false }
}
async function signIn() {
  if (busy.value) return
  if (!/^1[3-9]\d{9}$/.test(mobile.value.trim())) return fail('请输入有效的 11 位手机号。')
  if (!/^\d{6}$/.test(code.value.trim())) return fail('请输入 6 位短信验证码。')
  signingIn.value = true; feedback.value = ''
  try {
    await auth.login(mobile.value.trim(), code.value.trim())
    code.value = ''; devCode.value = ''
    await router.replace({ name: 'orders' })
  } catch (error) { fail(error instanceof Error ? error.message : '登录失败，请稍后重试。') }
  finally { signingIn.value = false }
}
watch(mobile, () => { code.value = ''; devCode.value = ''; feedback.value = '' })
onMounted(async () => {
  try { const saved = Number(sessionStorage.getItem(cooldownKey)); if (Number.isFinite(saved) && saved > Date.now()) cooldownUntil.value = saved } catch { /* No storage dependency. */ }
  ticker = setInterval(() => { now.value = Date.now() }, 1000)
  try { development.value = (await authApi.config()).developmentSms } catch (error) { fail(error instanceof Error ? error.message : '服务暂不可用') }
})
onUnmounted(() => clearInterval(ticker))
</script>
<template>
  <main class="login-page">
    <section class="story-panel" aria-label="及时达工作空间">
      <a class="brand brand-light" href="/login"><span class="brand-mark">T</span><span>及时达<span class="brand-caption">工作空间</span></span></a>
      <div class="story-copy"><p class="eyebrow">CONNECTED TO YOUR WORK</p><h1>每一次连接，<br>让协作更进一步。</h1><p class="story-description">连接服务商与团队成员，<br>从一个安全、有序的工作空间开始。</p>
        <div class="orbit-art" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="orbit-center">T</span><span class="orbit-node node-one"></span><span class="orbit-node node-two"></span><span class="orbit-node node-three"></span></div>
        <div class="story-features"><span><i></i>手机号验证</span><span><i></i>单账户单会话</span><span><i></i>7 天登录有效期</span></div>
      </div>
      <p class="story-footer">及时达 · 服务商与人员协作平台</p>
    </section>
    <section class="form-panel"><div class="login-card">
      <div class="login-heading"><span class="section-tag">欢迎回来</span><h2>登录工作空间</h2><p>使用账户绑定的手机号，安全访问后台。</p></div>
      <form @submit.prevent="signIn" novalidate>
        <label for="mobile">手机号</label><div class="phone-input"><span aria-hidden="true">+86</span><input id="mobile" v-model="mobile" :disabled="busy" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="11" placeholder="请输入 11 位手机号" required :aria-invalid="feedbackKind === 'error' && !!feedback" aria-describedby="login-feedback"></div>
        <div class="field-title"><label for="code">短信验证码</label><span>6 位数字</span></div>
        <div class="code-row"><input id="code" ref="codeInput" v-model="code" :disabled="busy" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="请输入验证码" required aria-describedby="login-feedback"><button class="code-button" type="button" :disabled="busy || seconds > 0" @click="sendCode">{{ sending ? '发送中…' : seconds > 0 ? `${seconds} 秒后重试` : '获取验证码' }}</button></div>
        <p id="login-feedback" class="feedback" :class="{ error: feedbackKind === 'error' || (!feedback && auth.message.value) }" role="status" aria-live="polite">{{ statusMessage }}</p>
        <button class="primary login-button" type="submit" :disabled="busy"><span>{{ signingIn ? '正在登录…' : '登录工作空间' }}</span><span aria-hidden="true">↗</span></button>
      </form>
      <div v-if="development" class="development-note">本地测试模式 · 验证码不会发送到真实手机<span v-if="devCode">本次测试验证码：{{ devCode }}</span></div>
      <div class="login-note"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" stroke="currentColor" stroke-width="1.5"/><path d="m8 12 3 3 5-6" stroke="currentColor" stroke-width="1.5"/></svg><p>账户由管理员添加。新设备登录后，<br>原设备会自动退出，保护你的账户安全。</p></div>
      <p class="login-help">还没有账户？请联系你的服务商管理员。</p>
    </div><p class="form-footer">及时达账户服务 <span>·</span> 安全连接，安心协作</p></section>
  </main>
</template>
