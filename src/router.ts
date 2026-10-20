import { createRouter, createWebHistory } from 'vue-router'
import { auth } from './state/auth'
import LoginView from './views/LoginView.vue'
import WorkspaceView from './views/WorkspaceView.vue'
import AdminLayout from './layouts/AdminLayout.vue'
import OrdersView from './views/OrdersView.vue'
import CreateOrderView from './views/CreateOrderView.vue'
import OrderDetailView from './views/OrderDetailView.vue'
export const router = createRouter({history:createWebHistory(),scrollBehavior:(_to,_from,savedPosition)=>savedPosition||{left:0,top:0},routes:[
  {path:'/login',name:'login',component:LoginView},
  {path:'/',component:AdminLayout,meta:{requiresAuth:true},children:[
    {path:'',redirect:{name:'orders'}},
    {path:'orders',name:'orders',component:OrdersView},
    {path:'orders/new',name:'create-order',component:CreateOrderView},
    {path:'orders/:id',name:'order-detail',component:OrderDetailView},
    {path:'account',name:'workspace',component:WorkspaceView},
  ]},
  {path:'/:pathMatch(.*)*',redirect:'/'},
]})
router.beforeEach(async(to)=>{
  if(!auth.initialized.value){try{await auth.refresh()}catch{}}
  if(to.meta.requiresAuth&&!auth.session.value)return{name:'login'}
  if(to.name==='login'&&auth.session.value)return{name:'orders'}
})
