// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appName => '镜序 Studio';

  @override
  String get tagline => '让每个镜头，值得交付。';

  @override
  String get projects => '项目';

  @override
  String get tasks => '任务';

  @override
  String get skills => '技能';

  @override
  String get settings => '设置';

  @override
  String get connect => '连接工作站';

  @override
  String get connectIntro => '远程工具为可选能力，项目仍保存在本机。';

  @override
  String get serverAddress => '工作站地址';

  @override
  String get pairingToken => '配对令牌';

  @override
  String get connectionHelp => '填写 HTTPS 工作站地址和配对令牌。令牌位于桌面端设置 → 配对信息。';

  @override
  String get connecting => '正在连接…';

  @override
  String get cancel => '取消';

  @override
  String get save => '保存修改';

  @override
  String get saved => '已保存';

  @override
  String get create => '创建项目';

  @override
  String get newProject => '开始一个新故事';

  @override
  String get projectName => '项目名称';

  @override
  String get description => '故事简介';

  @override
  String get script => '剧本';

  @override
  String get scriptHint => '每段一个画面或一句对白，拆镜后可继续精修。';

  @override
  String get format => '画幅';

  @override
  String get style => '视觉风格';

  @override
  String get cinematic => '电影写实';

  @override
  String get animation => '动画';

  @override
  String get ad => '产品广告';

  @override
  String get noProjects => '下一个故事，从这里开始。';

  @override
  String get noProjectsHint => '新建项目或打开示例，无需账号或工作站。';

  @override
  String get shots => '分镜';

  @override
  String get characters => '角色';

  @override
  String get review => '检查';

  @override
  String get delivery => '交付';

  @override
  String get assets => '素材';

  @override
  String get importAssets => '导入素材';

  @override
  String get imported => '素材已导入';

  @override
  String get shot => '镜头';

  @override
  String get shotTitle => '镜头标题';

  @override
  String get scene => '场景';

  @override
  String get shotType => '景别';

  @override
  String get duration => '时长（秒）';

  @override
  String get dialogue => '对白 / 字幕';

  @override
  String get prompt => '生成提示词';

  @override
  String get repairNote => '返修要求';

  @override
  String get voiceover => '镜头配音';

  @override
  String get sourceAudio => '保留源音轨';

  @override
  String get generate => '生成候选';

  @override
  String get visualReview => '视觉模型检查';

  @override
  String get visualReviewHelp => '将镜头与参考图发送给你配置的视觉模型，结果由你确认。';

  @override
  String get versions => '候选版本';

  @override
  String get selectVersion => '选用此版';

  @override
  String get selected => '已选用';

  @override
  String get newVersionHint => '新候选不会覆盖当前已选版本。';

  @override
  String get noMedia => '尚未选择素材';

  @override
  String get demo => '演示素材';

  @override
  String get demoHint => '演示素材，非在线 AI 生成结果。';

  @override
  String get pending => '待确认';

  @override
  String get approved => '已通过';

  @override
  String get changes => '需返修';

  @override
  String get queued => '排队中';

  @override
  String get running => '执行中';

  @override
  String get succeeded => '已完成';

  @override
  String get failed => '失败';

  @override
  String get cancelled => '已取消';

  @override
  String get reviewStatus => '审核状态';

  @override
  String get noTasks => '队列很安静。';

  @override
  String get noTasksHint => '生成和导出任务会显示在这里。';

  @override
  String get retry => '重新创建任务';

  @override
  String get cancelTask => '取消任务';

  @override
  String get render => '渲染 MP4';

  @override
  String get archive => '打包项目';

  @override
  String get subtitles => '字幕 SRT';

  @override
  String get storyboardCsv => '分镜 CSV';

  @override
  String get downloadShare => '保存 / 分享';

  @override
  String get exportHelp => '合成已选镜头，保留源音轨或配音，混入背景音乐并可烧录字幕。';

  @override
  String get subtitleTiming => '已应用的时间轴按分段时间显示；其他镜头按台词显示。导出前请试听核对。';

  @override
  String get burnSubtitles => '将字幕烧录到画面';

  @override
  String get backgroundMusic => '背景音乐';

  @override
  String get noMusic => '不添加背景音乐';

  @override
  String get exportHistory => '导出记录';

  @override
  String get noExports => '第一份成片正在路上。';

  @override
  String get addCharacter => '添加角色';

  @override
  String get characterName => '角色名字';

  @override
  String get characterDescription => '外观、服装与音色';

  @override
  String get reference => '参考图';

  @override
  String get noReference => '尚未绑定参考';

  @override
  String get referenceHint => '参考图提供约束，无法保证完全一致，请逐镜检查。';

  @override
  String get checks => '制作检查';

  @override
  String get noFindings => '规则检查通过。';

  @override
  String get manualReview => '请预览完整成片，检查面部、服装、场景和节奏。';

  @override
  String get openShot => '打开镜头';

  @override
  String get agent => '导演助手';

  @override
  String get agentHint => '说明具体修改要求，助手使用你配置的模型和所选技能。';

  @override
  String get send => '发送';

  @override
  String get message => '你的修改要求';

  @override
  String get selectSkill => '选择技能';

  @override
  String get modelSettings => '模型与 API Key';

  @override
  String get generationService => '视频生成服务';

  @override
  String get provider => '服务类型';

  @override
  String get endpoint => 'API 服务地址';

  @override
  String get model => '模型 ID';

  @override
  String get apiKey => 'API Key';

  @override
  String get keySaved => 'Key 已保存，留空保留。';

  @override
  String get modelHelp => 'API Key 存在本机安全存储，生成请求直连服务商，费用由服务商收取。';

  @override
  String get demoMode => '演示模式（不调用在线生成）';

  @override
  String get gateway => '自定义任务网关';

  @override
  String get assistantModel => '助手模型';

  @override
  String get language => '语言';

  @override
  String get systemLanguage => '跟随系统';

  @override
  String get english => 'English';

  @override
  String get chinese => '简体中文';

  @override
  String get workstation => '工作站';

  @override
  String get disconnect => '断开连接';

  @override
  String get connected => '已连接';

  @override
  String get notConnected => '尚未连接';

  @override
  String get loading => '正在打开创作空间…';

  @override
  String get error => '需要处理一个问题';

  @override
  String get tryAgain => '重试';

  @override
  String get ok => '好的';

  @override
  String get delete => '删除';

  @override
  String get confirmDelete => '删除此项目？建议先导出备份。';

  @override
  String get seconds => '秒';

  @override
  String get revision => '版本';

  @override
  String get refresh => '刷新';

  @override
  String get addShot => '添加镜头';

  @override
  String get localRules => '本地规则分镜初稿，智能改编可使用导演助手。';

  @override
  String get invalidServer => '请输入有效工作站地址，不包含凭据或查询参数。';

  @override
  String get httpsRequired => '远程工作站必须使用 HTTPS。';

  @override
  String get invalidResponse => '工作站返回了无效响应。';

  @override
  String get requestFailed => '请求失败，请检查连接后重试。';

  @override
  String get connectFirst => '请先连接工作站。';

  @override
  String get downloadFailed => '下载失败，请刷新项目后重试。';

  @override
  String get required => '此项不能为空。';

  @override
  String get invalidDuration => '时长需在 2 至 30 秒之间。';

  @override
  String get savedToFiles => '已准备好保存或分享';

  @override
  String get emptySkills => '暂无可用技能';

  @override
  String get approvals => '外部工具请求';

  @override
  String get approve => '批准执行';

  @override
  String get reject => '拒绝';

  @override
  String get approvalHint => '仅批准你了解的工具与参数。';

  @override
  String get newTask => '任务已加入队列';

  @override
  String get builtIn => '内置';

  @override
  String get custom => '自定义';

  @override
  String get originalContent => '剧本、提示词和素材名称保留原文。';

  @override
  String get localFirst => '本地创作，自由掌控。';

  @override
  String get localFirstHint => '项目保存在这台设备，配置自己的 API Key 后即可在线生成。';

  @override
  String get openDemo => '打开示例故事';

  @override
  String get onDevice => '已保存在本机';

  @override
  String get trimStart => '裁切起点（秒）';

  @override
  String get moveShots => '调整镜头顺序';

  @override
  String get reorderHelp => '长按拖动调整故事顺序，保留全部候选版本。';

  @override
  String get missingMedia => '请为镜头选择素材。';

  @override
  String get missingScene => '请补充场景设定。';

  @override
  String get missingReference => '请绑定角色参考图。';

  @override
  String get compare => '对比候选';

  @override
  String get configureModel => '请先在设置中配置模型和 API Key。';

  @override
  String get taskFailed => '任务失败，请检查服务商、额度与素材后重试。';

  @override
  String get unknownSubmission => '提交结果未知，请先核对服务商任务记录，再决定是否新建付费任务。';

  @override
  String get exportInterrupted => '导出被中断，可从已保存的镜头重新渲染。';

  @override
  String get remoteMayContinue => '已在本机停止，服务商可能仍会继续处理和计费。';

  @override
  String get trimExceedsMedia => '裁切与镜头时长超出视频长度，请缩短镜头或选择其他候选。';

  @override
  String get staleRevision => '项目已更新，请刷新后再保存。';

  @override
  String get taskExists => '该镜头已有进行中的任务。';

  @override
  String get unsupportedFile =>
      '请选择 PNG、JPEG、WebP、MP4、MP3、WAV、M4A、TXT 或 SRT 文件。';

  @override
  String get imageReviewOnly => '手机视觉检查目前支持所选静帧图片，视频连续性请通过播放检查。';

  @override
  String get hasMedia => '为保留已有候选，请先创建项目副本再重新拆镜。';

  @override
  String get importProject => '导入项目备份';

  @override
  String get advanced => '高级工具';

  @override
  String get keepOpen => '本地导出时请保持应用打开。再次进入应用可继续查询生成状态。';

  @override
  String get paidPreview => '开发预览 · 尚未开放付费';

  @override
  String get scriptDraft => '生成分镜初稿';

  @override
  String get exportOptions => '导出选项';

  @override
  String get deleteShot => '删除镜头';

  @override
  String get confirmDeleteShot => '删除该镜头及其候选关联？导入的原始素材仍会保留。';

  @override
  String get production => '制作空间';

  @override
  String get noScript => '先添加剧本，再生成分镜初稿。';

  @override
  String get pickMedia => '选择项目素材';

  @override
  String get story => '故事';

  @override
  String get sampleInfo => '原创示例插画 · 不代表 AI 生成质量';

  @override
  String get saveFirst => '请先保存修改。';

  @override
  String get importToShot => '添加为候选';

  @override
  String get copyProject => '创建项目副本';

  @override
  String get skillsHint => '为导演助手复用创作与检查指令。';

  @override
  String get costNotice => '在线生成消耗服务商额度，新候选会保留当前已选版本。';

  @override
  String get mcpTools => 'MCP 与浏览器工具';

  @override
  String get mcpHelp =>
      '手机支持可信的 HTTPS Streamable HTTP MCP 服务，外部工具调用等待你确认。本地 STDIO 工具在桌面运行。';

  @override
  String get addServer => '添加服务';

  @override
  String get serverName => '服务名称';

  @override
  String get serverToken => 'Bearer 令牌（可选）';

  @override
  String get testTools => '发现工具';

  @override
  String get serverUrl => 'MCP 服务地址';

  @override
  String get skillContent => '操作指令';

  @override
  String get skillName => 'Skill 标识';

  @override
  String get skillDescription => '用途说明';

  @override
  String get newSkill => '创建 Skill';

  @override
  String get licenses => '开源组件许可';

  @override
  String get importProjectPackage => '导入项目包';

  @override
  String get packageImportTitle => '换个设备，接着创作。';

  @override
  String get packageImportHelp => '将素材、候选和剪辑记录恢复为独立项目，保留现有项目。';

  @override
  String get packageExportTitle => '把项目，一起带走。';

  @override
  String get packageExportHelp => '打包素材、角色、候选、剪辑、已完成成片与导演对话，便于在其他设备继续制作。';

  @override
  String get packagePrivacyHint => '模型设置、进行中的生成任务与工具授权保留在原设备。';

  @override
  String get packageSizeHint => 'ZIP 最大 2 GB，单个源素材最大 200 MB。';

  @override
  String get chooseProjectPackage => '选择项目 ZIP';

  @override
  String get importAsNewProject => '导入为新项目';

  @override
  String get openImportedProject => '打开已导入项目';

  @override
  String get shareProjectPackage => '分享项目包';

  @override
  String get packageComplete => '项目已准备好';

  @override
  String packageSummary(int shots, int assets) {
    return '$shots 个镜头 · $assets 个素材';
  }

  @override
  String get packageSavedHint => '即使打开或分享被中断，已保存的项目仍然可用。';

  @override
  String get readingPackage => '正在读取项目包…';

  @override
  String get extractingPackage => '正在恢复素材…';

  @override
  String get checkingPackage => '正在检查素材…';

  @override
  String get savingPackage => '正在保存项目…';

  @override
  String get packingProject => '正在打包项目…';

  @override
  String get invalidPackage => '项目包损坏或不是支持的镜序项目包。';

  @override
  String get packageVersion => '请更新镜序，以打开此版本的项目包。';

  @override
  String get packageTooLarge => '项目包超过大小限制，请拆分项目后导出。';

  @override
  String get packageMissingMedia => '项目包缺少引用的素材。';

  @override
  String get invalidPackageMedia => '部分素材无法读取，请检查原文件后重新打包。';

  @override
  String get packageStorageError => '无法写入项目文件，请检查存储空间与访问权限。';

  @override
  String get packageCancelled => '项目传输已取消。';

  @override
  String get speechTitle => '台词配音';

  @override
  String get speechSettings => '台词配音服务';

  @override
  String get speechProtocol => '兼容 Speech API，返回 WAV。填写服务商当前支持的模型与音色。';

  @override
  String get speechVoice => '音色 ID';

  @override
  String get speechSpeed => '配音语速';

  @override
  String get speechModel => '语音模型 ID';

  @override
  String get speechBaseUrl => '语音服务地址（不含 audio/speech）';

  @override
  String get speechGenerate => '生成台词配音';

  @override
  String get speechReview => '先听声音，再定画面。';

  @override
  String get speechReviewHelp => '核对台词、音色与语速，生成后试听并选用。旧音轨和候选素材一起保留。';

  @override
  String get speechSendNotice => '台词将发送给你配置的服务并可能计费。AI 配音将保留为独立素材。';

  @override
  String get speechCreate => '确认并生成配音';

  @override
  String get speechConfigButton => '配置配音服务';

  @override
  String get speechTaskAccepted => '配音任务已创建';

  @override
  String get speechAcceptedHelp => '可以离开此页，在任务队列查看；本地导出时请保持应用打开。';

  @override
  String get speechRefresh => '刷新已创建的任务';

  @override
  String get speechRefreshError => '任务已创建，刷新失败。重试只刷新，不会再次提交。';

  @override
  String get speechReturn => '返回镜头试听与选用';

  @override
  String get speechGenerating => '正在生成配音';

  @override
  String get speechSaved => '配音已保存，试听后选为镜头音轨。';

  @override
  String get speechUnknownSubmission => '配音结果未知，请先核对服务商记录，避免重复计费。';

  @override
  String get speechTextInvalid => '请填写不超过 3000 字的镜头台词。';

  @override
  String get speechTextChanged => '台词已改变，请保存并重新核对配音内容。';

  @override
  String get configureSpeech => '请配置语音服务地址、模型、音色与 API Key。';

  @override
  String get speechSpeedInvalid => '配音语速必须在 0.25 到 4 之间。';

  @override
  String get speechTooLarge => '生成音频超过 32 MB 限制。';

  @override
  String get speechInvalidAudio => '服务商未返回可识别的 WAV 音频。';

  @override
  String get speechTimeout => '配音等待超时。请先核对服务商记录，避免重复计费。';

  @override
  String get speechFailed => '配音未完成。请检查设置与服务商记录，再决定是否重试。';

  @override
  String get speechCancelled => '已停止本地配音等待，远端可能继续执行。';

  @override
  String get speechPlay => '试听配音';

  @override
  String get speechPause => '暂停试听';

  @override
  String get speechReplay => '重新试听';

  @override
  String get speechTrackDuration => '音轨时长';

  @override
  String get speechLongTrack => '配音长于镜头，成片会截断。请缩短台词、调整语速或延长镜头，再试听核对。';

  @override
  String get speechPlaybackError => '音频未能播放，请检查文件或更换音轨后重试。';

  @override
  String get speechSeek => '配音播放进度';

  @override
  String get speechRetryNotice => '重新创建将使用当前保存的台词与语音设置，可能再次计费。';

  @override
  String get speechNewRequest => '核对并创建新的配音';

  @override
  String speechHttpError(String status) {
    return '语音服务返回 HTTP $status。请检查账户与模型权限。';
  }

  @override
  String get captionsTitle => '时间轴字幕';

  @override
  String get captionsIntro => '以镜头起点为零编辑。可导入桌面识别结果，也可手动调整。剧本台词保持原文。';

  @override
  String get captionStart => '开始 / 秒';

  @override
  String get captionEnd => '结束 / 秒';

  @override
  String get captionText => '字幕文本';

  @override
  String get captionAdd => '添加字幕段';

  @override
  String get captionApply => '应用时间轴字幕';

  @override
  String get captionFallback => '切回台词字幕';

  @override
  String get captionFromDialogue => '从当前台词开始编辑';

  @override
  String get captionEmpty => '时间轴为空，应用后此镜头不显示字幕。';

  @override
  String get invalidCaptions => '字幕时间应顺序排列、不重叠，并位于镜头时长内；每条需有文本。';

  @override
  String get captionStale => '音轨或剪辑已改变。请重新核对字幕，或切回台词字幕后再导出。';

  @override
  String get captionSavedRefresh => '字幕已保存，刷新失败。重试只刷新，不会重复保存。';

  @override
  String get captionRefresh => '刷新已保存字幕';

  @override
  String get captionNoMedia => '先为镜头选择素材，再创建时间轴字幕。';

  @override
  String get captionCurrentSource => '当前镜头素材';

  @override
  String get captionRemove => '删除字幕';

  @override
  String get shotGeneration => '生成镜头素材';

  @override
  String get generateImage => '生成图片';

  @override
  String get animateImage => '用选中图片生成视频';

  @override
  String get imageProvider => '图片生成';

  @override
  String get firstFrameTask => '首帧视频';

  @override
  String get imageReview => '确认生成图片';

  @override
  String get firstFrameReview => '确认用首帧生成视频';

  @override
  String get generationSendNotice => '请核对将发送到服务商的内容。生成可能产生费用。';

  @override
  String get generationImages => '将发送的图片';

  @override
  String get generationNoReferences => '无参考图';

  @override
  String get generationPrompt => '将发送的提示词';

  @override
  String get generationConfirm => '确认并加入队列';

  @override
  String get generationRefresh => '刷新';

  @override
  String get backToShot => '返回镜头';

  @override
  String get configureImage => '请在设置中填写 Seedream 服务地址、模型 ID 和 API Key。';

  @override
  String get configureFirstFrame => '请配置 Seedance 视频服务，再用选中图片生成视频。';

  @override
  String get seedreamSettingsHelp => '使用已开通的 Seedream 模型，从镜头和角色参考生成图片。';

  @override
  String get imageBaseUrl => 'API 基础地址，不含 /images/generations';

  @override
  String get clearImageKey => '清除已保存的图片 API Key';

  @override
  String get firstFrameAspect => '画幅跟随首帧';

  @override
  String get generationChanged => '项目或服务配置已改变，请刷新后重新确认。';

  @override
  String get imagePromptRequired => '请先填写并保存镜头提示词。';

  @override
  String get imageReferenceLimit => '图片生成最多使用 10 张参考图。';

  @override
  String get imageReferenceInvalid => '参考图须为项目中的 PNG、JPEG 或 WebP 图片。';

  @override
  String get imageReferencesTooLarge => '参考图超过上传大小限制。';

  @override
  String get imageInvalid => '图片服务未返回可读取的单张图片。';

  @override
  String get imageResponseTooLarge => '图片服务响应超过 28 MB。';

  @override
  String get generationSubmitting => '正在提交给服务商，请勿重复提交。';

  @override
  String get generationPolling => '远程任务已创建，等待视频。';

  @override
  String get generationCandidateSaved => '候选已保存，请回到镜头版本列表查看。';

  @override
  String get generationReviewAgain => '请先核对服务商记录，再回到镜头重新确认并提交。';

  @override
  String get remoteGenerationId => '远程任务 ID';

  @override
  String generationHttpError(String status) {
    return '服务商返回 HTTP $status。请检查账号和模型权限。';
  }

  @override
  String get generationVideoInvalid => '服务商未返回可读取的 MP4。';

  @override
  String get generationRemoteFailed => '服务商报告远程任务失败。';

  @override
  String get generationTimedOut => '视频生成等待超时，请核对服务商任务记录。';

  @override
  String get generationDownloadFailed => '下载服务商的视频失败。';
}
