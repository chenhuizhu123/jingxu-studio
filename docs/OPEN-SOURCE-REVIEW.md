# 开源复用评估与落地

核对日期：2026-11-05。以官方仓库、实际 LICENSE 和已安装依赖为依据。以下判断针对“付费、BYOK、本地优先、Windows/macOS + Flutter 手机端”的镜序 Studio；没有将仓库介绍当成我们已验证的功能，也没有因项目开源就免除集成测试。

| 项目                                                                          | 官方许可记录                                                                       | 对本产品的用途与取舍                                                                             | 实际状态                                                                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [LangGraph JS](https://github.com/langchain-ai/langgraphjs)                   | [MIT](https://github.com/langchain-ai/langgraphjs/blob/main/LICENSE)               | 模型请求、工具执行、路由与执行边界。可在本地 Node 运行，不必购买托管服务                         | **已接入** `@langchain/langgraph` 1.6.1，替换桌面导演助手的手写循环；版本与传递依赖锁在 package-lock.json               |
| [gray-matter](https://github.com/jonschlinkert/gray-matter)                   | 仓库 MIT                                                                           | 正确解析 Skill 的 YAML 元信息，包括引号、冒号、多行说明                                          | **已接入**；支持原有 `.md` 和标准 `目录/SKILL.md`，仅接受 YAML 头部；不执行 JS 头部或附带脚本                           |
| [Goose](https://github.com/aaif-goose/goose)                                  | [Apache-2.0](https://github.com/aaif-goose/goose/blob/main/LICENSE)                | 本地通用 Agent、桌面/CLI/API、MCP 扩展是很贴近的参考。官方提供嵌入 API，但仍需完成接口与分发验证 | **已评估，未嵌入**。本轮采用可直接进入现有 Node 引擎的 LangGraph；不将 Goose 的能力计作镜序已拥有                       |
| [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)           | [MIT](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/LICENSE)            | 主题→脚本→配音→素材→字幕→合成的工作流很相关；更适合作为短视频自动生产的参考或可选外部适配器      | **已评估，未复制/打包**。先核对独立运行接口、依赖、生成内容与平台发布授权；Python 工作流不能直接替换 Flutter 原生编辑器 |
| [OpenCut](https://github.com/OpenCut-app/OpenCut)                             | [MIT](https://github.com/OpenCut-app/OpenCut/blob/main/LICENSE)                    | 时间线与编辑器设计相关；官方 README 明确正在重写，原版在 opencut-classic                         | **参考，未接入**。新版 Editor API、插件、MCP 等列为重写方向，不能当成已稳定可嵌入的能力                                 |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp)                 | [Apache-2.0](https://github.com/microsoft/playwright-mcp/blob/main/LICENSE)        | 浏览器任务可通过标准 MCP 工具接入，避免自写页面定位框架                                          | **候选外部服务，未启用/未做浏览器实测**。现有 MCP 接口可配置服务，不等于这个服务已经验证通过                            |
| [pro_video_editor](https://pub.dev/packages/pro_video_editor/versions/2.51.0) | 安装包 BSD-3-Clause；须保留原文与 notices                                          | 手机端视频裁切、拼接、音频、字幕图层；使用平台媒体能力                                           | **此前已接入** Flutter。已通过平台编译；一次 iOS 原生时长测试失败后修复了状态刷新竞态，尚未完成原生复测                 |
| [火宝短剧](https://github.com/chatfire-AI/huobao-drama)                       | [CC BY-NC-SA 4.0](https://github.com/chatfire-AI/huobao-drama/blob/master/LICENSE) | 业务方向很接近，但当前许可含非商业限制                                                           | **不纳入付费产品代码**，未复制、未打包。不能将“源码可见”当作允许商用                                                    |

## 本轮真正改了什么

- 导演助手由 LangGraph `StateGraph` 驱动，分为模型与工具节点，保留已有 BYOK HTTP 接口和经过校验的项目工具。外部 MCP 请求仍只创建待确认记录。
- 每个返回的工具调用都得到结果回复；超过每轮 10 次、总共 40 次的工具预算会明确返回“未执行”。最多 8 次模型请求。
- 同一运行内重复出现的工具 ID 不重复执行；相同 ID 换参数会被拒绝。JSON 参数错误、工具错误进入模型上下文，模型响应协议错误停止运行。
- 工具大结果裁切后仍然是有效 JSON。原实现直接截断序列化字符串，可能产生不完整 JSON。
- 本地 SQLite 保存运行阶段、工具名称与状态；错误脱敏，不保存 API Key 或工具参数。启动时将未结束记录标为 interrupted。可通过受认证的 `GET /api/projects/:id/agent-runs` 查看。
- **这不是 LangGraph 检查点恢复的完整实现。** 不会自动重放中断运行，也未宣称跨崩溃恰好执行一次。用户须查看已保存修改与工具授权后再继续，避免重复付费或外部写入。
- Skill 用 gray-matter 解析并校验元信息；修复旧预览版写出字面量换行分隔符的问题，保存新 Skill 时由库生成合法 YAML。自定义 Skill 可覆盖同名内置 Skill。附带资源的自动读取/执行尚未实现。
- 构建产物增加 `dist/runtime/THIRD_PARTY_NOTICES.txt`，从已安装的运行时依赖生成版权与许可文本。现有 FFmpeg 二进制的来源与分发义务仍需单独完成，见 THIRD-PARTY.md。

## 验证与边界

本轮 `npm run test:coverage`：141 项通过；语句 85.1%、分支 73.17%、函数 81.5%、行 87.46%，满足当前阈值。包含 LangGraph 节点执行、错误与调用预算、重复调用、防 JS 元信息执行、真实 MCP STDIO 通信、真实媒体 ZIP 往返、CRC/路径/重复条目/符号链接拒绝、导入回滚。

模型行为使用确定性的本地测试服务，不代表真实供应商模型效果。API/MCP 测试没有打开浏览器。浏览器与 Simulator 的界面访问限制仍然存在；没有用 Playwright MCP 绕过这些限制。Windows、iOS 真机和商业发布验收仍未完成。

另已完成 Mac 0.1.1 包内运行检查。首次打包漏带 LangGraph 的 peer 依赖 `@langchain/core`，已列为显式运行依赖；修复后的包通过 `npm run test:package`。该检查直接运行包内核心引擎，未启动界面，细节见 CLIENT-PREVIEWS.md。

## 后续复用顺序

1. 将已接入的执行记录接到客户端可见的任务诊断，补充用户取消和可检查的恢复入口，再评估是否需要 LangGraph 持久检查点。
2. 配音、语音识别和字幕对齐优先寻找可嵌入的现成引擎或公开 API 适配器；先做实际音频与时间轴验收，再计入功能。
3. 对 MoneyPrinterTurbo 的接口与模块做独立试验，通过后再接可选适配器；不增加默认必需的远程业务后端。
4. 浏览器营销自动化通过标准 MCP 连接可审阅的服务，发布类操作在产品中保留确认与结果记录；本轮未实施发布。

## 手机项目包落地补充（0.1.3）

实际复用 `archive` 4.6.0（MIT）和 `json_schema` 5.2.2（Boost Software License 1.0），许可依据为已安装依赖 LICENSE。前者负责 ZIP 编解码/CRC，后者校验桌面生成的共享契约；避免维护两套自行实现的 ZIP 与字段校验器。应用层仍负责文件边界、引用关系、新 ID、原子发布和取消。

44 项 Flutter 单元/组件测试通过；另外专用命令执行两次跨端用例，用真实 PNG/MP4/WAV/SRT 验证双向包、媒体字节与项目语义。见 MOBILE-PACKAGE-VALIDATION.md。原生设备探测和系统文件/分享面板尚未验收，开源复用不代表免测。

## 手机试听落地（0.1.4）

实际接入 [just_audio 0.10.6](https://pub.dev/packages/just_audio/versions/0.10.6)，以已安装 LICENSE 核对 MIT 与附带 ExoPlayer Apache 2.0 notices。使用其本地文件播放器、播放/暂停/seek 和状态流，补充应用自己的路由/后台暂停与失败提示。没有编写自己的音频解码器。

语音 HTTP 请求使用已接入 `http` 1.6.0 的 AbortableRequest；实际本地 HTTP 服务取消 header 与 body 等待的测试通过。新增 17 项手机引擎与 6 项 UI 测试，完整套件 67 通过。插件原生播放仍需真机验证，组件状态测试不冒充原生音频结果。
