<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { orderApi } from '../api/orders'
import type { CatalogProduct } from '../api/orders'
import type { OrderOptions } from '../domain/orders'
import { orderPayload, yuanToCents, money } from '../domain/order-form'
import type { OrderDraft } from '../domain/order-form'
import { auth } from '../state/auth'
import ProductThumbnail from '../components/ProductThumbnail.vue'
const router = useRouter()
let itemKey = 1
const draft = reactive<OrderDraft>({cityId:'',brandId:'',plateId:'',items:[{key:itemKey++,itemName:'',spec:'',salesPrice:'',quantity:1}],contacts:'',messages:'',referenceId:'',payPrice:'',arrivedTime:30})
const options = ref<OrderOptions>()
const loading = ref(true)
const demo = ref(false)
const createKey = crypto.randomUUID()
const brandHint=ref('')
const failedProductImages=ref(new Set<string>())
const saving = ref(false)
const error = ref('')
const productQuery=ref(''),productRows=ref<CatalogProduct[]>([]),productLoading=ref(false),productError=ref(''),productSearched=ref(false),productPage=ref(1),productHasMore=ref(false)
let productEpoch=0
function clearProductResults(){productEpoch++;productRows.value=[];productError.value='';productSearched.value=false;productLoading.value=false;productHasMore.value=false}
async function searchProducts(page=1){
  const keyword=productQuery.value.trim()
  if(keyword&&keyword.length<2){productError.value='请输入至少 2 个字的商品名称或完整 UPC 码，也可留空浏览商品。';return}
  const request=++productEpoch,owner=auth.session.value?.account.id
  productLoading.value=true;productError.value='';productRows.value=[];productSearched.value=false
  try{const result=await orderApi.products(keyword,page);if(request!==productEpoch||owner!==auth.session.value?.account.id)return;productRows.value=result.products;productPage.value=page;productHasMore.value=result.hasMore;productSearched.value=true}
  catch(e){if(request===productEpoch)productError.value=e instanceof Error?e.message:'商品搜索失败'}
  finally{if(request===productEpoch)productLoading.value=false}
}
function chooseProduct(product:CatalogProduct){
  const same=draft.items.find(item=>item.catalogId===product.id)
  if(same){same.quantity=Math.min(9999,Number(same.quantity||0)+1);return}
  const empty=draft.items.find(item=>!item.itemName.trim()&&!item.salesPrice&&!item.catalogId)
  if(!empty&&draft.items.length>=50){productError.value='每单最多 50 件商品。';return}
  const item={key:empty?.key||itemKey++,itemName:product.name.slice(0,120),spec:product.spec.slice(0,120),salesPrice:product.price?(product.price/100).toFixed(2):'',quantity:1,upc:product.upc,catalogId:product.id,imageUrl:product.imageUrl}
  if(empty)Object.assign(empty,item);else draft.items.push(item)
  const normalized=(name:string)=>name.normalize('NFKC').replace(/\s+/g,'').toLowerCase()
  const brand=options.value?.brands.find(option=>Boolean(product.brandId)&&option.id===product.brandId)
    || options.value?.brands.find(option=>Boolean(product.brandName)&&normalized(option.name)===normalized(product.brandName))
  if(brand){draft.brandId=brand.id;brandHint.value=`已带出商品品牌 ${brand.name}，可手动修改。`}
  else brandHint.value=product.brandName?`商品品牌为 ${product.brandName}，请在订单品牌中手动确认。`:'此商品未提供品牌，请手动选择订单品牌。'
}
onUnmounted(()=>{productEpoch++})
const total = computed(() => draft.items.reduce((sum,item)=> { try { const quantity=Number(item.quantity); return sum+(Number.isInteger(quantity)&&quantity>0 ? yuanToCents(item.salesPrice)*quantity : 0) } catch {return sum} },0))
function addItem() {if(draft.items.length<50) draft.items.push({key:itemKey++,itemName:'',spec:'',salesPrice:'',quantity:1})}
function removeItem(key:number) {draft.items=draft.items.filter(item=>item.key!==key)}
async function submit() {
  if(saving.value) return
  error.value = ''
  let payload
  try {payload=orderPayload(draft)} catch(e) {error.value=e instanceof Error?e.message:'请检查订单信息'; return}
  saving.value = true
  try { const label=(key:keyof OrderOptions,id:string)=>options.value?.[key].find(item=>item.id===id)?.name||''; const order=await orderApi.create({...payload,cityName:label('cities',payload.cityId),brandName:label('brands',payload.brandId),platformName:label('platforms',payload.plateId)},createKey); await router.replace({name:'order-detail',params:{id:order.id}}) }
  catch(e) {error.value=e instanceof Error?e.message:'订单创建失败' }
  finally {saving.value=false}
}
onMounted(async()=>{void searchProducts(1);try{const data=await orderApi.options();options.value=data;demo.value=data.demo;draft.plateId=data.platforms.find(p=>p.name==='美团')?.id||(data.platforms.length===1?data.platforms[0]?.id:'')||''}catch(e){error.value=e instanceof Error?e.message:'城市品牌加载失败'}finally{loading.value=false}})
</script>
<template>
  <section class="admin-page create-order-page"><div class="admin-page-heading"><div class="form-title"><RouterLink :to="{name:'orders'}" aria-label="返回订单列表">←</RouterLink><h1>新建及时达订单</h1></div><span>{{auth.session.value?.account.providerName}} · {{auth.session.value?.account.personName}}</span></div>
    <p class="preview-note">手动建单、手动付款。提交付款信息后，由管理端确认收款并审核，审核通过后后台创建履约订单。</p><p v-if="demo" class="preview-note">履约系统目录尚未配置，当前城市、品牌和平台为测试选项；测试订单不会发送至真实履约系统。</p><p v-if="loading" class="detail-help">正在加载城市、品牌和平台…</p>
    <form @submit.prevent="submit" novalidate><fieldset :disabled="saving||loading||!options"><div class="order-meta"><label>城市 <select v-model="draft.cityId" aria-label="城市"><option value="">请选择城市</option><option v-for="item in options?.cities" :key="item.id" :value="item.id">{{item.name}}</option></select></label><label>品牌 <select v-model="draft.brandId" aria-label="品牌" @change="brandHint='已按你的选择更新订单品牌。'"><option value="">请选择品牌</option><option v-for="item in options?.brands" :key="item.id" :value="item.id">{{item.name}}</option></select><span v-if="brandHint" class="brand-selection-note" role="status">{{brandHint}}</span></label><label>订单平台 <select v-model="draft.plateId" aria-label="订单平台"><option value="">请选择平台</option><option v-for="item in options?.platforms" :key="item.id" :value="item.id">{{item.name}}</option></select></label></div>
      <h2 class="form-divider">商品信息</h2><section class="product-picker" aria-label="商品库搜索"><div class="product-search-row"><label for="product-query">从标准商品库添加</label><input id="product-query" v-model="productQuery" aria-label="UPC 或商品名称" maxlength="100" placeholder="输入 UPC 码或商品名称，留空浏览商品" @input="clearProductResults" @keydown.enter.prevent="searchProducts(1)"><button class="mint-button" type="button" :disabled="productLoading" @click="searchProducts(1)">{{productLoading?'搜索中…':'搜索商品库'}}</button></div><p class="detail-help">商品来自标准商品库。选择后带入名称、规格、UPC 和参考单价，单价可按本次订单修改。</p><p v-if="productError" class="admin-error" role="alert">{{productError}}</p><p v-if="productSearched&&!productRows.length" class="detail-help" role="status">未找到匹配商品，可换个关键词或手工填写商品。</p><ul v-if="productRows.length" class="product-results"><li v-for="product in productRows" :key="product.id"><span class="product-thumbnail"><img v-if="product.imageUrl&&!failedProductImages.has(product.id)" :src="product.imageUrl" :alt="`${product.name}商品图`" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="failedProductImages.add(product.id)"><span v-else>暂无图</span></span><div class="product-result-copy"><strong :title="product.name">{{product.name}}</strong><span :title="[product.spec,product.upc,product.brandName].filter(Boolean).join(' · ')">{{product.spec||'无规格'}} · UPC：{{product.upc||'暂无'}}<template v-if="product.brandName"> · {{product.brandName}}</template></span></div><span class="product-result-price">{{product.price?money(product.price):'暂无参考价'}}</span><button class="plain-button" type="button" @click="chooseProduct(product)">加入订单</button></li></ul><div v-if="productSearched&&(productPage>1||productHasMore)" class="product-pages"><button type="button" class="plain-button" :disabled="productLoading||productPage===1" @click="searchProducts(productPage-1)">上一页商品</button><span>第 {{productPage}} 页</span><button type="button" class="plain-button" :disabled="productLoading||!productHasMore" @click="searchProducts(productPage+1)">下一页商品</button></div></section><div class="items-table-scroll"><table class="items-table"><thead><tr><th>商品名称 <span>*</span></th><th>规格</th><th>单价（元） <span>*</span></th><th>数量 <span>*</span></th><th>操作</th></tr></thead><tbody><tr v-for="(item,index) in draft.items" :key="item.key"><td data-label="商品名称 *"><div class="order-item-identity"><ProductThumbnail :src="item.imageUrl" :name="item.itemName"/><div class="order-item-copy"><input v-model="item.itemName" :aria-label="`商品 ${index+1} 名称`" maxlength="120" placeholder="请输入商品名称"><span v-if="item.upc" class="item-upc">UPC：{{item.upc}}</span></div></div></td><td data-label="规格"><input v-model="item.spec" :aria-label="`商品 ${index+1} 规格`" maxlength="120" placeholder="选填"></td><td data-label="单价（元） *"><input v-model="item.salesPrice" :aria-label="`商品 ${index+1} 单价`" inputmode="decimal" placeholder="0.00"></td><td data-label="数量 *"><input v-model="item.quantity" :aria-label="`商品 ${index+1} 数量`" type="number" min="1" max="9999" step="1"></td><td class="item-remove-cell"><button type="button" class="remove-item" @click="removeItem(item.key)">删除</button></td></tr></tbody></table></div><button class="add-item" type="button" :disabled="draft.items.length>=50" @click="addItem">＋ 添加商品</button><p class="order-total">商品总价：<strong>{{money(total)}}</strong></p>
      <div class="order-text-fields"><label>收件信息 <span>*</span><textarea v-model="draft.contacts" aria-label="收件信息" maxlength="1000" rows="4" placeholder="请输入收件人、手机号及完整收件地址"></textarea></label><label>用户备注<textarea v-model="draft.messages" aria-label="用户备注" maxlength="1000" rows="4" placeholder="选填，例如配送注意事项"></textarea></label></div><div class="order-meta order-submit-meta"><label>外部订单号（选填）<input v-model="draft.referenceId" aria-label="外部订单号" maxlength="100" placeholder="选填，填写外部平台订单号"></label><label>订单应付金额（元） <span>*</span><input v-model="draft.payPrice" aria-label="订单应付金额" inputmode="decimal" placeholder="请输入订单应付金额"></label><label>剩余送达时间（分钟） <span>*</span><input v-model="draft.arrivedTime" aria-label="剩余送达时间" type="number" min="1" max="1440" step="1"></label></div>
      <p v-if="error" class="admin-error" role="alert">{{error}}</p><div class="order-actions"><RouterLink class="plain-button" :to="{name:'orders'}">返回列表</RouterLink><button class="mint-button" type="submit">{{saving?'正在创建…':'保存订单，提交付款信息'}}</button></div></fieldset></form>
  </section>
</template>
