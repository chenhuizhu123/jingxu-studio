# 镜序桌面付费试点

2026 年 11 月 6 日。首发范围为桌面，手机保持开发预览。先完成本地验收，再通过商户沙盒核对支付与授权。测试商品价格只用于沙盒流程，公开定价需经过试点验证。

## 支付渠道

| 优先级 | 渠道                 | 适合镜序的地方                                                                                         | 需要实测                                                                                                                   |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 主方案 | Creem                | MoR、独立测试模式、托管结账，以及桌面授权码的激活、校验与解绑 API。官网标示基础交易费 3.9% + 0.40 美元 | 商品审核、商户主体与出款路径、试点用户可用支付方式、退款后授权状态与撤销时间                                               |
| 备选   | Waffo Pancake（MoR） | 托管结账、单次与订阅、支付事件，本地钱包和中国出款渠道值得验证                                         | 核对 Pancake 账户实际可开通的微信支付、支付宝、出款方式与 MoR 费率。授权码交付和设备激活是不同环节，后者按镜序自管方案评估 |

[Creem 价格](https://www.creem.io/) · [支持地区](https://docs.creem.io/merchant-of-record/supported-countries) · [桌面授权流程](https://docs.creem.io/skills/creem-api/WORKFLOWS) · [Waffo MoR](https://waffo.com/en/merchant-of-record) · [Waffo 托管结账](https://waffo.com/en/checkout) · [Waffo 买家条款](https://waffo.com/en/terms)

## 在本机验证 Creem 沙盒

1. Creem 后台切换 **Test Mode**，创建一个桌面软件测试商品，启用 **License Keys**。试点验收可用一次性测试商品和 1 个设备名额。订阅和续订需要另跑测试用例。
2. 在工作区根目录创建仅自己可读的 `.env.creem.test`，设置 `CREEM_TEST_API_KEY` 和 `CREEM_TEST_PRODUCT_ID`。仓库忽略 `.env*`。API Key 保存在本机或服务端密钥管理系统，商品 ID 可以用于协作定位。
3. 读取测试商品，确认价格、币种和销售类型。随后显式创建测试结账，用平台测试支付方式完成订单。

```sh
node --env-file=.env.creem.test --import tsx scripts/creem-sandbox.ts product
node --env-file=.env.creem.test --import tsx scripts/creem-sandbox.ts checkout
```

4. 在本机配置增加 `CREEM_TEST_LICENSE_KEY`，值为测试订单产生的买家授权码。执行 `activate` 后，将返回的 `instanceId` 写入 `CREEM_TEST_INSTANCE_ID`。然后校验并解绑同一个实例。

```sh
node --env-file=.env.creem.test --import tsx scripts/creem-sandbox.ts activate
node --env-file=.env.creem.test --import tsx scripts/creem-sandbox.ts validate
node --env-file=.env.creem.test --import tsx scripts/creem-sandbox.ts deactivate
```

工具只连 `test-api.creem.io`，校验返回模式和产品归属，输出过滤后的商品、测试结账和授权状态。创建会话和激活都有外部状态变化。遇到连接中断时先在测试后台核对会话或设备，再重试。脚本使用模拟 HTTP 响应通过协议测试。

### 已接入的账单服务与桌面端（2026-11-06）

- 测试商品 `prod_2aq8elgLi8H8JPjWmFsLr2`（$19 一次性买断）已通过 API 创建；商品读取与结账会话创建已在真实 Test Mode 验证（结账会话 `ch_*`，托管页 `creem.io/test/checkout/...`）。
- `apps/billing` 是单文件 Serverless 账单服务（`worker.ts`，Web 标准 fetch + HMAC，可直接部署 Cloudflare Worker；`npm run billing:dev` 用本机 Node 适配器跑在 8790）。桌面端只调用该服务，商户 Key 不下发客户端。
  - 路由：`POST /v1/checkout`、`/v1/licenses/{activate,validate,deactivate}`、`POST /v1/webhooks/creem`（`creem-signature` HMAC-SHA256 验签）。
  - webhook 验签后按事件 ID 幂等去重；`checkout.completed` 校验商品 ID 必须等于 `CREEM_PRODUCT_ID`（同账户其他商品只登记不落订单），将订单号、客户邮箱、金额币种和授权码写入台账，用于客服查单（「付费后没收到码」）。存储为可选注入：Cloudflare 部署绑定名为 `BILLING_KV` 的 KV 命名空间；本机/Node 自托管设 `BILLING_LEDGER_FILE=/path/to/billing-ledger.jsonl`（追加式 JSONL，重启后重建索引）。存储故障不阻塞事件确认，Creem 重试时幂等防重。授权状态本身仍以 Creem 校验结果为准（退款/拒付后下次 validate 即失效）。
  - 桌面端通过 `JINGXU_BILLING_API_URL`、`JINGXU_BILLING_ENFORCE=1` 指向该服务；授权状态存工作区 `license.json`（0600），保留 14 天离线宽限。设置页提供购买（外链托管结账）、授权码激活、立即校验与解绑。
  - 单测见 `tests/creem-client.test.ts`、`tests/billing-worker.test.ts`、`tests/billing-ledger.test.ts`、`tests/licensing.test.ts`。
- 待人工完成：① Creem 后台给该测试商品启用 License Keys 交付（1 设备，API 不支持配置）；② 用测试卡 `4111 1111 1111 1111` 完成一次真实结账并跑通 activate/validate/deactivate；③ 后台生成 webhook secret 填入 `CREEM_WEBHOOK_SECRET`，部署账单服务（生产绑定 `BILLING_KV` KV 命名空间）并把域名配置到桌面端构建环境；④ 用后台「Send test event」核对真实载荷与商品 ID 过滤。

### 部署账单服务到 Cloudflare Worker

`apps/billing/wrangler.toml` 已就绪，入口为纯 Web 标准的 `src/worker.ts`（Node 适配器不进 edge 包；`npm run billing:deploy:dry` 已实测 bundle 782.61 KiB，无任何 `node:` 内建模块）。

```sh
npx wrangler login
# 创建订单台账命名空间，把输出的 id 填回 wrangler.toml 的 [[kv_namespaces]]
npx wrangler kv namespace create BILLING_KV -c apps/billing/wrangler.toml
# 写入密钥（商户 Key 与 webhook 签名密钥，只存于 Worker secrets）
npx wrangler secret put CREEM_API_KEY        -c apps/billing/wrangler.toml
npx wrangler secret put CREEM_WEBHOOK_SECRET -c apps/billing/wrangler.toml
# 非密钥项（CREEM_PRODUCT_ID / ALLOWED_ORIGINS / CREEM_SUCCESS_URL）在 wrangler.toml [vars]
npm run billing:deploy:dry   # 不部署，仅验证打包与绑定
npm run billing:deploy
```

部署后：

- 在 Creem 后台 **Developers → Webhooks** 注册 `https://jingxu-billing.<你的子域>.workers.dev/v1/webhooks/creem`，订阅 `checkout.completed`（需要退款对账时再加 `subscription.*` / license 相关事件），用「Send test event」核对台账。
- 桌面端构建环境设置 `JINGXU_BILLING_API_URL=https://jingxu-billing.<你的子域>.workers.dev`、`JINGXU_BILLING_ENFORCE=1`。
- 健康检查：`GET /healthz` 返回 `{ "ok": true, "mode": "prod" }`。
- 自托管 Node 而不用 Cloudflare 时，`BILLING_LEDGER_FILE=/data/billing-ledger.jsonl npm run billing:dev` 提供等价的追加式台账。

## 从沙盒到试点发布

- **收款和授权**。托管结账完成后，由单独的 HTTPS 服务确认付款，检查事件签名、商品 ID、订单及幂等状态（已实现，台账存 `BILLING_KV`/JSONL）。应用取得期限明确的设备授权，续期前做在线校验。商户 Key 和回调密钥放在服务端。桌面端已接入账单服务（购买、激活、校验、解绑与 14 天离线宽限），尚待真实测试订单、退款、拒付与授权过期的端到端核对；解绑换机后保留用户的项目、备份和已有导出访问权。
- **安装包**。当前 Mac QA 二进制运行 `ffmpeg -L` 显示不可再分发。标签发布会拦截此类媒体二进制。对外试点前，换用可分发且有对应源码和构建记录的 FFmpeg、ffprobe，再核对授权、签名、公证和 Windows 原生安装。 [第三方组件说明](THIRD-PARTY.md)
- **试点验收**。由真实创作者独立完成试用工程出片，再用自己的素材完成返修及工程备份。记录首次出片用时、单镜返修用时、失败环节，以及对本地工程与批量交付的付费反馈。真实供应商生成与计费分开验收。

[用户手册](USER-MANUAL.md) · [本地验收记录](VALIDATION.md)
