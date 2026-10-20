<script setup lang="ts">
import { computed } from 'vue'
import { auth } from '../state/auth'
const account=computed(()=>auth.session.value?.account)
const expiry=computed(()=>auth.session.value ? new Date(auth.session.value.expiresAt).toLocaleString('zh-CN',{hour12:false}) : '')
</script>
<template><section v-if="account" class="admin-page"><div class="admin-page-heading"><h1>我的账户</h1><RouterLink class="mint-button" :to="{name:'create-order'}">新建及时达订单</RouterLink></div><dl class="profile-details"><div><dt>服务商名称</dt><dd>{{account.providerName}}</dd></div><div><dt>人员名称</dt><dd>{{account.personName}}</dd></div><div><dt>手机号</dt><dd>{{account.mobile}}</dd></div><div><dt>角色</dt><dd>{{account.role==='admin'?'管理员':'服务商成员'}}</dd></div><div><dt>登录有效至</dt><dd>{{expiry}}</dd></div></dl><p class="session-tip">同一账号在其他设备登录后，此处将自动返回登录页。</p></section></template>
