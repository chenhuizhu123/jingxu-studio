# 手机项目包与双引擎验证

2026-11-05。手机源码版本 0.1.5，桌面预览版本 0.1.4；均为开发预览。

## 实现

手机项目页的“打包项目”输出 ZIP，项目列表顶部可选择 ZIP 导入为新项目。保存新 ID 并重建引用，不覆盖原项目。包含素材、角色参考、历史与已选候选、排序/裁切、配音/BGM、视觉检查、导演对话和已存在的 MP4/SRT；不迁入模型设置、API Key、执行中的任务、工具权限或可执行 Skill 文件。

共享 v1/v2 Schema 从桌面契约生成并作为 Flutter asset 打包。`archive` 负责 ZIP 文件流/CRC，`json_schema` 负责字段契约。手机后台 isolate 流式检查和解包，单个素材 200 MB、总包 2 GB、条目 3000，清单 8 MB；路径、重复条目、加密、符号链接、压缩方法、声明与实际大小均检查。媒体检查之后才通过短暂的串行提交发布项目。准备阶段支持取消；落库阶段禁止中途取消。

通过同一文件夹的暂存/重命名和标记恢复管理异常退出。若存储返回失败但回读确认已写入，保留确认的项目/ZIP 并返回结果；数据库不可读时保守保留带标记文件供启动恢复，不删除无法确认的已用媒体。字幕在成片记录发布前写完，避免紧接着打包时漏掉 SRT。

## 实际证据

- `flutter analyze --no-pub`：无问题。
- `flutter test --no-pub --coverage --reporter expanded`：77 通过、1 跳过。跳过的是需要专用环境的跨端用例，并非将失败标为跳过。日志 `artifacts/mobile-tests-0.1.5.log`。
- `npm run test:interop`：分别执行第一阶段与返回阶段，均通过。报告 `artifacts/package-interop/report.json`。
- TypeScript → Flutter → TypeScript，以及 Flutter → TypeScript → Flutter 两个实际 ZIP 链路均通过。真实 PNG、3 秒带 AAC 音轨 MP4、WAV、双语 SRT；比较媒体 SHA-256、角色引用、候选选择、裁切排序、音频、检查、对话、时间戳和成片。
- 异常用例覆盖 CRC/路径/符号链接/重复/加密/膨胀大小/UTF-8/缺失素材/未知版本，入库前后失败、确认已提交但回执失败、取消停滞数据流/媒体探测/解包/导出，遗留清理和原项目保留。
- 组件测试实际导入本地 ZIP，验证中英文、取消保留选择，以及刷新失败重试不重复导入。保存 22 张 Flutter goldens，见 PROGRESS.md。

## 复现

先安装 Node 与 Flutter 依赖，再从根目录运行：

```sh
npm run test:interop
cd apps/mobile
flutter analyze --no-pub
flutter test --no-pub --coverage
```

不要并发运行共享 Flutter 构建目录的测试和原生构建。`scripts/generate-project-schema.ts --check` 检测共享与移动端 Schema 是否过期。

## 验证边界

跨端测试在主机 Flutter 测试环境使用真实图像解码，视频/音频由真实 FFmpeg 探测；不等于 Android Media3/iOS AVFoundation 已执行通过。真机文件选择、媒体检查、分享、后台挂起、大包性能和磁盘不足仍需设备验收。原生元数据探测超时/取消会停止导入等待，但底层平台调用不提供可强制终止的原语。

部分历史手机字段允许超出 v1 契约长度，超长项目会被拒绝。尚未统一所有编辑器约束与历史数据迁移，不静默截断创作内容。角色一致性与供应商生成质量未由此证明；项目 ZIP 是手动迁移，不是自动云同步。

手机 0.1.4 新增实际生成 WAV 素材 → 手动选为音轨 → ZIP 导出 → 导入为新项目的回归，字节与重映射后的音轨引用均通过。本轮再次执行专用双引擎命令，两个方向均通过。真实平台媒体检查与播放仍待设备验收。

含时间轴字幕输出 v2，旧客户端拒绝；无时间轴仍输出 v1。新版两套引擎均读 v1/v2，互操作真实检查了字幕 source.assetId 重映射、分段时间和文字。过期字幕内容可随项目备份，但不生成冒充当前字幕的 SRT；已有成片的字幕独立保留。详见 TRANSCRIPTION-CAPTIONS.md。
