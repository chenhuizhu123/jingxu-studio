# 客户端开发预览

## 2026-11-06 本地验收

桌面 0.1.10 的本轮构建位于 `release/macos-0.1.10-local-qa/` 和 `release/Jingxu-Studio-0.1.10-win-x64.exe`。Apple Silicon 包内引擎跑通实际 MP4、SRT 和 ZIP 恢复。Windows 通过交叉构建和 PE/ASAR 检查。两个版本均用于本地验收，正式签名和 Windows 原生执行待验证。Mac 的打包 FFmpeg 自报不可再分发，标签发布会拦截。手机预览继续使用下列 0.1.6 产物。

[Mac 包内检查](../release/macos-0.1.10-local-qa/package-check.json) · [Windows 包结构检查](../release/windows-package-check.json) · [桌面试点](DESKTOP-PILOT.md)

## 2026-11-05 历史预览

2026-11-05。当前桌面 0.1.9，手机 0.1.6，均为工作区开发预览。

| 平台                | 产物                                                                                                                                              | 验证范围                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Windows x64         | [0.1.9 安装程序](../release/Jingxu-Studio-0.1.9-win-x64.exe)，约 183 MB                                                                           | NSIS 交叉构建，包内架构、依赖和当前 dist 一致性通过。未签名，Windows 实机待验收      |
| macOS Apple Silicon | [0.1.9 DMG](../release/macos-0.1.9/Jingxu-Studio-0.1.9-mac-arm64.dmg)，约 195 MB，[ZIP](../release/macos-0.1.9/Jingxu-Studio-0.1.9-mac-arm64.zip) | Electron Node 24.22.2 包内核心、跨集场景同步及工程恢复通过。未签名和公证，GUI 待验收 |
| Android ARM64       | [0.1.6 APK](../release/Jingxu-Studio-0.1.6-android-arm64-preview.apk)，约 35 MB                                                                   | Release 优化，SDK 24/36，versionCode 2006，v2 测试签名通过，待真机验收               |
| iOS Simulator       | [0.1.6 模拟器 ZIP](../release/Jingxu-Studio-0.1.6-ios-simulator-preview.zip)                                                                      | Debug 构建，build 6，Simulator 双架构通过，界面待验收，需 Xcode Simulator            |

[交付文件大小与 SHA-256 清单](../release/preview-manifest.json)。旧版文件及版本化检查报告保留。官网尚未托管这些安装文件，当前通过工作区交付。

用户确认暂时没有 Windows 环境，先交付预览并继续开发；这不表示 Windows 实机验收通过。Intel Mac 尚未交付。

## 无需 API Key 的首片体验

下载[中文示例工程](../apps/website/src/samples/jingxu-rain-sample-zh.zip)或[英文示例工程](../apps/website/src/samples/jingxu-rain-sample-en.zip)。示例含三个已选演示插画的竖屏镜头和台词字幕。桌面端从「导入项目包」打开 ZIP，再选「导出成片」和「渲染成片」。手机端从项目页右上角导入，在「交付」中选「渲染 MP4」。

桌面从空工作区导入并生成约 12 秒的成片及 SRT，验证了实际下载接口。Flutter 测试导入了两份官网 ZIP 并核对所选素材；设备端渲染待实测。示例可用 `npx tsx scripts/website-samples.ts` 从现有项目格式和演示插画重建。

## 新版变化

桌面 0.1.9 在分镜检查器新增「镜头参考图」。从项目素材选图，保存后可打开「跨集同步场景参考」。按同一剧集的场景名匹配，忽略大小写和多余空白。已有参考或部分镜头无法更新的分集需要手动选择。同步添加图片并保留原有图片、候选和选片，受影响镜头进入待核对。

[可导入的「雨夜来信」场景同步示例](../artifacts/scene-sync-0.1.9/jingxu-rain-scene-sync.zip)。恢复整季工程后，在第 2 集第一个镜头的参考图旁打开链接按钮，预览并勾选第 7 集。可使用本地参考及试用工程，无需配置模型 Key。

桌面 0.1.8 增加可编辑的整季工程包。导出保留各集的剧本、候选、角色与素材引用、成片及时间轴字幕。目标工作区一次恢复独立剧集副本。单包上限 2 GiB，最多 99 集及 15,000 个 ZIP 条目。手机端使用现有单集包导入。

桌面 0.1.7 可在分集的「角色与场景」中同步已绑定的定妆图和人设。先预览同名匹配，再勾选目标集。已有定妆图或自定义人设的集需手动选择。应用后保留各镜头的候选和选片，引用此角色的镜头需重新核对。同步后的角色与图片可随单集项目包迁移。

桌面 0.1.6 增加多集导入、分集预览、追加、切换和批量交付。可识别中英文编号标题，无标题时可选初稿每集镜头数。批量渲染跳过缺素材、字幕来源过期或已有渲染任务的集。交付 ZIP 收录各集最新可下载的 MP4、对应 SRT 和缺失集号。桌面工作区管理剧集分组，单集项目包仍可导入手机。

桌面 0.1.5 和手机 0.1.6 支持 Seedream 图片候选。设置中填写图片 API 基础地址、已开通模型 ID 与 Key。保存镜头后核对待发送的提示词、场景和角色参考，再提交任务。新候选进入同一个版本列表。选中图片后，可以将它作为 Seedance 视频的唯一首帧，画幅跟随首帧。两端已通过模拟服务验证，真实生成效果和计费待试用。

桌面新增用户配置的分段语音识别：裁切实际镜头音轨、发送前确认、字幕候选、试听、时间与文字编辑、应用/清除、来源过期检查。手机新增时间轴编辑与按段 SRT/字幕图层；手机在线识别提交尚未接入。每条成片可下载或分享它自己保存的字幕，避免与后续项目修改混用。详见 [字幕说明](TRANSCRIPTION-CAPTIONS.md)。

有时间轴的项目 ZIP 使用 v2，旧客户端拒绝，新版两端支持 v1/v2；无时间轴仍输出 v1。真实媒体和时间轴引用已通过双引擎往返。原有配音、项目迁移与失败恢复继续可用。

Node 全量 247 项通过，Flutter 最新全量 86 项通过，双向单集项目包互操作通过。测试与设备验证范围见 [VALIDATION.md](VALIDATION.md)。

## 包内检查

Mac `verify-packaged` 使用临时工作区，在包内 Electron Node 模式检查 MCP SDK、SQLite WASM、Sharp、LangGraph 工具、ZIP 媒体恢复、Skills YAML、许可文本和自带 FFmpeg。核对当前前端/本机引擎构建字节；没有打开窗口、访问浏览器或调用真实模型。

Windows 检查包内 PE 机器架构、运行依赖、许可、构建内容、安装程序及校验和，没有执行。CI 已配置原生检查，但仓库无远端，未运行 CI。

手机校验以实际 APK/Simulator `.app` 的元数据为准；不是原生播放、媒体性能、文件选择或系统分享验收。真实服务商识别准确率与生成质量、支付、正式签名与创作者试用仍未完成。

## 复现

```sh
npm run build
# macOS Apple Silicon, using a distinct output directory:
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --publish never -c.directories.output=release/macos-0.1.9
node scripts/verify-packaged.mjs 'release/macos-0.1.9/mac-arm64/镜序 Studio.app/Contents/MacOS/镜序 Studio'
# Native Windows:
npm run package:win
npm run test:package
npm run test:win:structure
# Windows preview from macOS/Linux, with isolated target dependencies:
npm run package:win:cross
```

手机需要 Flutter 3.44、Android SDK/JDK 21 或 macOS/Xcode。使用标准原生构建，测试或插件更新后不要加 `--no-pub`，以便按模式重生成注册表；旧测试插件残留曾导致 Release 编译失败，标准构建路径已修复，未修改 SDK 或手改生成文件。

```sh
npm run mobile:android
npm run mobile:verify:android
npm run mobile:ios
npm run mobile:verify:ios-simulator
node scripts/preview-manifest.mjs 'release/macos-0.1.9/mac-arm64/镜序 Studio.app'
```

Mac 显式目录是 `release/macos-0.1.9`；默认 `release/mac-arm64` 仍是旧版，不能对旧包测试后声称新版通过。Windows 暂存目录只复用带本产品标记且版本、依赖清单/锁文件相符的隔离目录，不把 Mac 原生依赖直接打入 Windows 包。
