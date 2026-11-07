# 镜序 Studio / Jingxu Studio

本地优先的短剧和营销视频制作工作台。项目、素材、候选版本、剪辑和导出由客户端管理；在线生成使用用户自己的 API Key。当前为开发预览，没有启用支付。

Local-first production for short dramas and marketing videos. Keep project data and editing on your device; bring your own generation provider. Development preview, with payments disabled.

桌面端从「所有项目」导入多集剧本，可先核对开场和结尾，随后创建、追加和切换分集。素材就绪后可以批量渲染，并下载含各集最新 MP4、对应 SRT 和清单的交付 ZIP。

换电脑继续制作时，从剧集卡片选择「导出整季工程」，在目标电脑的「所有项目」选择「恢复整季工程」。恢复后的剧集作为独立副本，可以继续编辑。

在分镜检查器的「镜头参考图」里从项目素材选图，保存后可将参考图应用到其他分集的同名场景。同步前可核对影响范围，保留已有参考和选片。

## 客户端 / Clients

| 入口            | 实现                              | 运行方式                        |
| --------------- | --------------------------------- | ------------------------------- |
| macOS / Windows | Electron + React + 本机 Node 引擎 | `npm run dev:desktop`           |
| Android / iOS   | Flutter，独立 SQLite 与安全存储   | `cd apps/mobile && flutter run` |
| Web 开发界面    | React + Vite，连接本机引擎        | `npm run dev`                   |
| 官网 / Website  | 中英文静态页面                    | `node apps/website/build.mjs`   |

桌面引擎的 HTTP 接口只用于客户端内部通信，默认绑定回环地址；无需部署镜序服务器。手机直接调用已配置的模型服务，使用原生引擎在本机渲染。云端许可、同步和支付尚未启用。

The desktop engine binds to loopback by default and requires no hosted Jingxu server. Flutter mobile has its own local engine and direct provider integration. Optional cloud licensing, sync and payments are not implemented.

## 开始 / Development

需要 Node.js 24+；手机需要 Flutter 3.44.0 / Dart 3.12、对应 Android SDK/JDK 21 或 Xcode。iOS 最低版本 14。

```sh
npm ci
npm run dev
```

开发地址为 `http://127.0.0.1:5173`，本机 API 为 `127.0.0.1:4318`。初次启动会建立明确标记的示例项目。真实生成在设置中配置 Seedance/Ark 或自定义任务网关；助手使用支持工具调用的 Chat Completions 兼容服务。不同供应商兼容程度与模型权限需要真实账户验证。

```sh
npm run build
npm test
npm run test:coverage
# Requires Flutter and fetched mobile dependencies:
npm run test:interop
npm run package:mac
# On Windows:
npm run package:win
# On macOS/Linux, with isolated Windows dependencies:
npm run package:win:cross
```

优先在目标系统上构建并运行验收。交叉构建 Windows 时，使用 `package:win:cross`，它在隔离目录安装 Windows x64 的 FFmpeg、Sharp 等预编译依赖，并检查包内架构与代码内容。这个检查不等于 Windows 已执行通过。签名和公证需要发布方证书；当前产物仍为预览。

```sh
cd apps/mobile
flutter pub get
flutter analyze
flutter test --coverage
flutter build apk --debug
flutter build ios --simulator --debug
```

`flutter test integration_test/local_production_test.dart -d DEVICE_ID` 会操作指定模拟器/设备并验证真实 SQLite、安全存储和原生渲染。仅在设备访问获准时运行；与编译、组件截图测试分别记录结果。不要并行运行共享同一 Flutter 构建目录的测试与平台构建。

## 能力与边界 / Scope

- 剧本、分镜、角色卡、参考素材、候选版本、镜头排序与裁切起点。
- 本地项目持久化、任务状态、远端任务 ID、生成参数快照、单镜重生成。
- 配音文件、源音轨、背景音乐、按镜头时间生成的 SRT、字幕烧录、MP4 和素材 ZIP。
- 中英文 UI、跟随系统的默认语言、手动切换，创作文本保留原文。
- 桌面 Agent 工具循环、Skills、STDIO / HTTP MCP；手机 Agent 工具循环、Skills、HTTPS Streamable HTTP MCP。外部调用等待用户确认。
- 桌面与手机 v1 项目 ZIP 打包/恢复，携带素材、角色、候选、剪辑、对话与已有成片；两套引擎真实往返已通过。原生文件选择/媒体探测/分享待真机验收，历史超长字段项目仍需兼容处理。
- 桌面与手机台词配音：用户配置兼容语音服务，提交前确认，生成 WAV 保留为独立素材，可试听与混音；真实供应商效果和手机原生播放待设备验证。详见 [配音说明](docs/VOICEOVER.md)。
- 桌面分段语音识别与可编辑时间轴字幕；手机可导入/编辑及按段渲染。字幕绑定素材/剪辑范围，项目包 v2 保留引用。真实识别准确率与原生效果仍待验收，见 [字幕说明](docs/TRANSCRIPTION-CAPTIONS.md)。
- 手机在线 ASR、词级精确对齐、图像生成适配、多集层级、自动发布、支付和协作仍待补齐。角色参考与视觉模型意见不能保证生成始终一致。

## 记录 / Evidence

- [产品用户手册](docs/USER-MANUAL.md)
- [桌面付费试点与 Creem 沙盒](docs/DESKTOP-PILOT.md)
- [产品交付标准](docs/PRODUCT.md)
- [截图与阶段进度](docs/PROGRESS.md)
- [竞品对比、缺口和验收项](docs/COMPETITIVE-REVIEW.md)
- [验证记录与未验证项](docs/VALIDATION.md)
- [第三方组件说明](docs/THIRD-PARTY.md)
- [开源复用评估与已接入模块](docs/OPEN-SOURCE-REVIEW.md)
- [客户端安装预览与包内检查](docs/CLIENT-PREVIEWS.md)
- [手机项目包与跨端验证](docs/MOBILE-PACKAGE-VALIDATION.md)

官网私有预览：[中文](https://jingxu-studio.toughjoy.chatgpt.site/)、[English](https://jingxu-studio.toughjoy.chatgpt.site/en/)。根仓库的官网源码位于 `apps/website`；`website/` 是保留 Sites 部署配置的独立 staging checkout，不能当作根仓库 git 子模块提交。
