# 验证记录 / Validation record

2026-11-05。桌面 0.1.9、手机 0.1.6 开发预览。编译、模拟服务、组件渲染与设备验收分别记录。

## 当前证据

| 项目                                          | 结果与范围                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript / Vite / 本机引擎构建              | `npm run build` 通过，当前桌面 0.1.9                                                                                                                                   |
| 桌面核心、API、Agent/MCP、媒体、内存 UI、官网 | 25 个测试文件、247 项通过；本轮完整执行 `npm run test:coverage`，日志 `artifacts/node-tests-0.1.9.log`                                                                 |
| 核心与 API 覆盖率                             | statements 89.00%，branches 79.33%，functions 88.14%，lines 91.25%；覆盖 `packages/core/src` 与 `apps/server/src`，不是所有客户端与完整用户流程                        |
| 覆盖率门槛                                    | statements 80%、branches 65%、functions 75%、lines 80%，当前通过                                                                                                       |
| 实际媒体处理                                  | FFmpeg 裁切/混音/音轨保留/字幕/越界拒绝，真实 PNG/MP4/WAV/SRT；新增配音素材参与 MP4，实际音轨能量检查通过                                                              |
| 桌面配音适配器                                | 16 项引擎/API 测试、10 项内存 UI/本地化测试；本地协议服务与真实 WAV。不是真实供应商发音质量验证，见 VOICEOVER.md                                                       |
| 手机引擎与 UI                                 | `flutter analyze --no-pub` 无问题，完整 86 项通过、1 个专用用例在全量运行时跳过。日志 `artifacts/flutter-tests-0.1.6.log`                                              |
| 双引擎项目 ZIP                                | 本轮 `npm run test:interop` 实际执行两个阶段通过，真实 PNG、带音轨 MP4、WAV、双语 SRT，比较语义与媒体字节；共享项目契约校验一致，且新增手机生成音轨的 ZIP 恢复测试通过 |
| 手机页面                                      | 中英文共 22 张 Flutter goldens，390 × 844，真实组件树与本地演示插画；快照 `docs/progress/2026-11-05-captions`，不是设备截图                                            |
| macOS Apple Silicon                           | 0.1.9 未签名 DMG/ZIP；包内引擎结果见 `release/mac-package-check.json`。不证明 GUI、安装与 Gatekeeper 验收                                                              |
| Windows x64                                   | 0.1.9 NSIS 交叉构建，应用、FFmpeg、Sharp/DLL 架构与当前 dist 一致性检查通过；没有在 Windows 执行                                                                       |
| Android ARM64                                 | 0.1.6 优化 APK，35,345,208 字节，SDK 24/36，versionCode 2006，v2 测试签名通过。无连接设备                                                                              |
| iOS                                           | 0.1.6/build 6 模拟器 Debug 编译、x86_64 和 arm64 架构校验、独立 ZIP 通过。需 Xcode Simulator，界面与设备运行待验收                                                     |
| 官网                                          | 中英文静态资源、候选交互与真实示例导出共 12 项通过，计入 Node 全量                                                                                                     |
| 依赖审计                                      | 前轮 `npm audit --omit=dev`：0 已知生产依赖漏洞；开发依赖 7 项（1 low、6 moderate）待升级。本轮依赖集合未变，未重复审计                                                |

## 仍未通过或未验证

- **iOS 原生渲染时长**：历史测试生成 MP4，但实际 8 秒、预期 6 秒，该次失败。已修复连续修改后读取旧状态的刷新竞态并通过单元回归；完整原生渲染尚未复测，不能宣称设备时长问题已通过。
- **界面权限**：本地 `127.0.0.1:5173`、私有官网浏览器打开与 Simulator 读取被工具策略拒绝。未使用其他浏览器、原始 CDP、系统截图或间接网页渲染获取受限界面。浏览器和 Electron E2E 尚未执行，goldens/jsdom 不替代它们。
- **Windows / Intel Mac**：用户确认暂时没有 Windows 环境，先交付预览、继续开发；这不等于实机通过。Intel Mac 仍未交付。仓库没有远端，CI 未运行；配置本身不是执行证据。
- **手机真机**：文件选择、硬件媒体探测、解码、系统分享、后台挂起、权限、磁盘不足和大包性能仍需设备验收。
- **模型与声音质量**：图像、视频、语音效果及计费需要实际服务商和模型权限。桌面与手机有 Speech-compatible 适配，手机播放器使用 just_audio。桌面分段 ASR 与可编辑时间轴已接入。手机在线 ASR、词级对齐和识别准确率仍待验证。
- **历史数据兼容**：支持 v1 项目包的双引擎往返已通过，但手机部分旧字段允许超过契约长度，超长项目拒绝，迁移与编辑器约束统一待完成；项目删除后的通用素材回收待补齐。
- **商业发布与付费意愿**：支付/许可、签名公证、运营主体、分发和第三方组件分发义务未完成。没有可购买订阅或真实付费意愿验证。自动平台发布、多集层级等范围仍未完成。

## 复现

```sh
npm ci
npm run build
npm run test:coverage
# Flutter dependencies must already be fetched:
npm run test:interop
cd apps/mobile
flutter pub get
flutter analyze --no-pub
flutter test --no-pub --coverage
```

平台预览、包内检查与校验和见 [CLIENT-PREVIEWS.md](CLIENT-PREVIEWS.md)；手机包详细证据见 [MOBILE-PACKAGE-VALIDATION.md](MOBILE-PACKAGE-VALIDATION.md)；配音协议、故障与使用边界见 [VOICEOVER.md](VOICEOVER.md)。

浏览器用例在 `tests/e2e`，Electron 在 `tests/electron`，原生手机在 `apps/mobile/integration_test`。仅在相应界面/设备访问获准时执行，不通过替代工具绕过当前拒绝。不要并行运行共享 Flutter 构建目录的测试或原生构建。

本轮 Android 首次 `--no-pub` 构建因残留测试插件注册失败；已采用标准 Flutter pub/tooling 再生成路径修复，实际 Release 构建与最终 APK 元数据/v2 签名检查通过。没有修改 SDK 或把测试插件并入生产依赖。CI 改为优化 ARM64 构建与实际包校验，尚未在远端执行。

iOS 0.1.5 采用标准 Flutter 原生构建（包含 tooling 更新）通过；`mobile:verify:ios-simulator` 验证版本/build、Simulator 平台与 Mach-O 架构并生成独立 ZIP 和 SHA-256 报告。没有启动 Simulator 界面。

## 时间轴字幕补充

本轮桌面 0.1.4 接入分段语音识别候选、编辑/应用与镜头来源绑定；手机 0.1.5 接入时间轴编辑和 SRT/原生字幕图层时间。项目包 v2 跨端实际往返通过。旧成片 SRT 通过独立保存/签名下载/手机分享入口提供，不从当前项目重建替代。详细命令、测试范围与限制见 TRANSCRIPTION-CAPTIONS.md。

## 图片候选与首帧视频

桌面 0.1.5 使用本地协议服务检查 Seedream 的去重参考图、请求快照、可解码 JPEG、错误响应、取消与重启恢复，以及 Seedance 的唯一首帧、随图画幅、实际 MP4 下载和候选选择。中英文组件测试核对发送前的提示词和素材确认。macOS 包内 Electron Node API 另通过图片任务、JPEG 下载与解码。证据见 `artifacts/node-tests-0.1.5.log` 与 `artifacts/mac-image-api-0.1.5.log`。

手机 0.1.6 增加 5 项引擎和 2 项中英文组件测试。使用真实 PNG 和合成 MP4 检查媒体保存与 ZIP 恢复、只上传选中首帧、取消清理、提交结果未知保护、已知远程 ID 续查和写入确认丢失。生产端 MP4 探测复用原生媒体组件，主机测试用实际文件字节作为响应，原生解码仍需设备验收。

## 多集导入与批量交付

桌面 0.1.6 增加 12 项解析、API 和组件测试，覆盖双语编号、长文本切分、预览确认、重复请求、追加冲突、保存失败回滚、单集项目包、批量渲染和签名下载。ZIP 内容中的 MP4 和 SRT 已与对应成片记录核对。

用 0.1.6 macOS 包内引擎独立跑通两集剧本导入、导入演示素材、渲染和交付 ZIP。报告在 `artifacts/series-0.1.6/package-smoke.log`，成片使用本地示例插画。浏览器和原生窗口视觉验收单列。

## 跨集角色同步

桌面 0.1.7 新增五项引擎/API 和三项中英文组件测试，覆盖同名预览、已有参考的显式选择、歧义和运行任务保护、并发修改、原子回滚、重复确认、旧视觉结果丢弃。模拟 Seedream 请求读取了同步后的精确图像和角色描述。验证单集 ZIP 恢复的角色参考图字节。

另用 macOS 0.1.7 包内引擎预览并同步两集之间的角色，检查选片保留、审核状态重置和导出 ZIP 里的图片字节。报告在 `artifacts/cast-sync-0.1.7/package-smoke.log`。真实服务商生成质量与设备窗口待验收。

## 可编辑整季工程迁移

桌面 0.1.8 新增六项引擎/API 和两项中英文组件测试。两个独立工作区往返混合 v1/v2 单集记录，校验非连续集号、候选、角色引用、时间轴字幕来源，以及真实 PNG、WAV、MP4 和 SRT。另测后续分集损坏、聚合大小限制、取消、磁盘故障和并发请求复用。

macOS 0.1.8 安装包内的两个独立本机引擎实际完成第 2 和第 7 集的导出、恢复及图片、MP4 和 SRT 字节比较。报告在 `artifacts/series-package-0.1.8/package-smoke.log`。界面与 Windows 实机待验收。

## 跨集场景参考

桌面 0.1.9 新增五项 API 测试和四项组件测试。验证同一剧集内的同名匹配、跨项目权限范围、保留原有参考与候选、跳过生成中和超出参考上限的镜头、预览过期、并发重试和磁盘失败回滚。另测参考图草稿与已保存内容冲突时的恢复操作。模拟 Seedream 收到共享图原始字节，单集 ZIP 导入后保留同一张图。

用 macOS 0.1.9 包内引擎将第 2 集的参考应用到第 7 集，确认保留原图和已选候选。再次提交同一请求、导出并重新恢复整季后，核对新引用与 119,300 字节的参考图片。报告和可操作示例在 `artifacts/scene-sync-0.1.9/`。Windows 实机、桌面窗口与真实生成效果待验收。
