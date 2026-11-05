# Third-party components

This inventory is a development record. Preserve upstream notices in distributions and complete an artifact-specific license review before commercial release.

| Component                                           | Use                                  | Upstream license record                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flutter / Dart                                      | Mobile runtime                       | Bundled Flutter license notices                                                                                                                                                                                                                                       |
| pro_video_editor 2.51.0                             | Native video composition on mobile   | BSD 3-Clause in the installed package LICENSE; preserve the notice in distributions                                                                                                                                                                                   |
| Noto Sans SC                                        | Chinese and Latin text and subtitles | SIL Open Font License 1.1, `resources/fonts/OFL.txt`                                                                                                                                                                                                                  |
| Electron                                            | Desktop runtime                      | Electron distribution notices                                                                                                                                                                                                                                         |
| React, Express, sql.js, Sharp, MCP SDK, yazl, yauzl | UI and local desktop engine          | Preserve installed package licenses and their dependency notices                                                                                                                                                                                                      |
| mcp_dart 2.4.3                                      | Mobile Streamable HTTP MCP           | Preserve the installed package LICENSE                                                                                                                                                                                                                                |
| ffmpeg-static 5.3.0                                 | Desktop FFmpeg executable            | Package metadata declares GPL-3.0-or-later. The bundled executable and enabled codecs require their own distribution obligations, notices and corresponding-source handling. A download link alone is not treated here as proof that those obligations are fulfilled. |

The desktop renderer invokes FFmpeg as a separate process and currently uses libx264. The runtime can be supplied through `JINGXU_FFMPEG`. Production packaging needs an explicit decision about the distributed FFmpeg build and license obligations. Commercial compliance has not yet been completed.

The mobile renderer uses platform media APIs through pro_video_editor, without bundling the desktop FFmpeg executable. Flutter's generated OSS license list does not automatically settle every custom asset or native dependency obligation.

## Agent 与 Skills 本轮复用

- `@langchain/langgraph` 1.6.1：MIT，实际用于桌面导演助手的图执行。
- `gray-matter`：MIT，实际用于 Skill 元信息解析与生成；只接受 YAML，不执行 JS 元信息。
- `scripts/third-party-notices.mjs` 随构建生成 `dist/runtime/THIRD_PARTY_NOTICES.txt`，包含已安装运行时依赖的许可文本；本轮遍历到 164 个包。分发中保留该文件与 Electron/font 自带 notices。它不替代 FFmpeg 对应源码等义务。
- Goose、OpenCut、MoneyPrinterTurbo、Playwright MCP 仅评估，未复制或打包。详见 OPEN-SOURCE-REVIEW.md。

## 手机项目包复用（0.1.3）

- `archive` 4.6.0：安装包 LICENSE 为 MIT。实际使用 ZIP 中央目录、流式文件编解码和 CRC 校验，不自行实现压缩算法；额外由业务层约束路径、条目与媒体大小。
- `json_schema` 5.2.2：安装包 LICENSE 为 Boost Software License 1.0。实际校验从桌面契约生成的共享 JSON Schema；引用关系由业务层补充校验。
- Flutter 的许可页面保留依赖的内置 notices。媒体仍由平台原生引擎处理，未在手机内打包桌面 FFmpeg。

## 手机音频试听（0.1.4）

- `just_audio` 0.10.6：已安装 LICENSE 为 MIT，附带 ExoPlayer 的 Apache 2.0 许可文本。实际用于本地音频加载、播放、暂停与定位，保留完整 notices。
- 传递依赖 `audio_session` 0.2.4 与 `just_audio_platform_interface` / `just_audio_web`、`rxdart` 已锁在 Flutter pubspec.lock。Flutter 自动许可列表应包含各包上游 notices；本轮没有自行实现音频解码器。
- 原生插件已列入平台构建；构建成功不等于设备播放验收。对控件状态的组件测试使用测试播放器，真实 WAV 协议/迁移测试分别记录。
