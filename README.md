# extrasWeb · 及时达后台前端

独立 Vue + TypeScript + Vite 工程。已包含短信验证码登录、发送倒计时、刷新恢复登录、受保护路由、当前账户信息、退出登录及会话失效处理。账户新增和管理暂不包含在本阶段。

## 本地开发

Node.js 需要 `^22.18.0 || >=24.12.0`；当前默认 Node 21 不兼容。可用 nvm：

```sh
nvm install
nvm use
npm ci
npm run dev
```

前端：http://127.0.0.1:5173 。后端在同级 `../extrasAccount`，使用它现有的运行环境启动 `npm run dev:env`，默认监听 http://127.0.0.1:3100 。SQLite 原生依赖应使用安装该后端依赖时的 Node 版本，不要直接复用前端的新 Node 版本运行旧二进制。

无需把短信配置复制到前端。`API_PROXY_TARGET` 默认为 `http://127.0.0.1:3100`；需要更改时复制 `.env.example` 为 `.env`。Vite 只代理 `/api`，保留 Host 与 Origin，使后端原有来源检查继续有效。如果后端明确设置了 `APP_ORIGIN`，开发时需配置为前端地址。浏览器始终请求当前页面来源的 `/api`。

## 接口

| 功能 | 接口 | 请求 |
| --- | --- | --- |
| 短信模式 | GET /api/config | — |
| 发送验证码 | POST /api/auth/code | `{mobile}` |
| 登录 | POST /api/auth/login | `{mobile, code}` |
| 当前账户 | GET /api/auth/me | — |
| 退出 | POST /api/auth/logout | `{}` |

登录有效期和单会话约束由后端处理。token 使用 HttpOnly Cookie，前端不读取或存储 token。每 30 秒、恢复窗口焦点及页面重新可见时检查会话；401 返回登录页并提示失效原因。临时网络错误不会直接清除已登录状态，退出失败时保留会话并允许重试。sessionStorage 只保存短信请求倒计时结束时间，验证码只在当前表单内存中保存。

真实短信模式不显示开发验证码；测试后端在 console 模式且返回 devCode 时提供明确的本地测试提示。

## 检查和部署

```sh
npm test
npm run build
npm run preview
```

`dist/` 为生产静态资源。生产服务器需要把页面路由回退到 `index.html`，把同域名 `/api/` 反向代理到后端；使用 HTTPS，并将后端 `APP_ORIGIN` 设为该正式域名。Vite 开发/预览代理配置不会写入生产构建。参考 `deploy/nginx.example.conf`。部署后无需将 token 改成 localStorage，也无需开放跨域凭据。

框架与代理参考：[Vue 官方指南](https://vuejs.org/guide/quick-start.html)、[Vite 代理配置](https://vite.dev/config/server-options#server-proxy)。

## 手工订单与手动付款

登录后进入 `/orders`；手工创建订单后进入 `/orders/:id`，填写手动付款流水号和说明，提交给管理端核对。资料提交后不会显示已收款。已有管理端通过 extrasAccount 的专用接口确认收款和审核，审核通过后由后台调用履约系统创建订单，再展示履约状态。

订单存到后台 SQLite，刷新会重新读取；不同账号的订单彼此隔离。列表支持服务端筛选和分页，详情每 15 秒刷新。收款、审核和履约三个状态分别显示，发起方不能自行确认收款或审核。

接口：GET/POST `/api/orders`、GET `/api/orders/:id`、POST `/api/orders/:id/manual-payment`、GET `/api/order-options`。完整管理端接口和请求样例见同级 `../extrasAccount/docs/orders-api.md`。不建设另外的管理端，不提供线上支付。

履约目录未配置时，页面明确显示测试选项；测试目录不会发送到真实履约系统。真实履约地址、服务商和签名配置仅在后台，浏览器不持有密钥。

### 付款截图与商品库

提交手动付款时必须选择 JPG、PNG 或 WebP 截图（单张不超过 5 MB）。截图和付款信息一起保存到后台 SQLite，刷新后仍可查看；旧的待收款订单可补充截图。管理端在订单详情及确认收款弹窗查看原图，截图不通过公开 URL 暴露。

新建订单的「从商品库添加」支持 UPC 精确搜索和名称搜索，带入名称、规格、UPC 和参考价格；参考单价仍可修改。商品库签名配置只存后台 STANDARD_ITEM_* 环境变量，前端通过 /api/products 查询。生产网关请求体需允许至少 8 MB，见 deploy/nginx.example.conf。

商品选择统一查询远端标准商品库 `/api/standard_item/admin/items/`：默认分页浏览，UPC 使用 `upc`，名称使用 `searchIndex`，固定 `status=0`，不维护本地商品库或失败回退商品。签名由后台实时生成。

外部订单号选填，空白可创建多笔不同订单；填写时仍防止同账号重复编号。界面与数据库保留空值，履约关联需要编号时使用本项目订单 ID。

商品结果区按三行高度滚动显示，展示标准库 HTTPS 商品主图，缺图或加载失败时显示占位。加入商品后按品牌名称匹配履约品牌目录并自动选择，仍允许手动修改；无法匹配时提示手动确认。

商品图片随订单快照保存，新建页面、订单列表和详情均显示缩略图；无图或加载失败时显示占位。付款截图与付款信息提交成功后自动返回订单列表，失败时保留表单供重试。

履约订单的状态、备注及配送信息由后台定期同步；订单列表和详情每 15 秒刷新，状态未变时也能展示最新备注与物流资料。上游尚未提供的内容显示为空。

付款资料被退回时，列表和详情展示原因，并保留旧流水、说明和截图供核对。服务商可修改资料，重新选择付款截图后再次提交；这一步只提交已发生付款的资料，不发起扣款或要求再次付款。页面轮询保留正在编辑的草稿，重提携带被退回的 previousNoteId，首次提交和历史补图流程不受影响。
