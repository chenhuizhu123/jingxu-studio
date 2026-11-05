// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Jingxu Studio';

  @override
  String get tagline => 'Make every shot worth delivering.';

  @override
  String get projects => 'Projects';

  @override
  String get tasks => 'Tasks';

  @override
  String get skills => 'Skills';

  @override
  String get settings => 'Settings';

  @override
  String get connect => 'Connect workstation';

  @override
  String get connectIntro =>
      'Optional remote tools never replace your local project library.';

  @override
  String get serverAddress => 'Workstation URL';

  @override
  String get pairingToken => 'Pairing token';

  @override
  String get connectionHelp =>
      'Use your HTTPS workstation address and its pairing token. Find the token in desktop Settings → Pairing.';

  @override
  String get connecting => 'Connecting…';

  @override
  String get cancel => 'Cancel';

  @override
  String get save => 'Save changes';

  @override
  String get saved => 'Saved';

  @override
  String get create => 'Create project';

  @override
  String get newProject => 'Start a new story';

  @override
  String get projectName => 'Project name';

  @override
  String get description => 'Story brief';

  @override
  String get script => 'Script';

  @override
  String get scriptHint =>
      'One scene or line of dialogue per paragraph. You can refine the storyboard later.';

  @override
  String get format => 'Aspect ratio';

  @override
  String get style => 'Visual style';

  @override
  String get cinematic => 'Cinematic';

  @override
  String get animation => 'Animation';

  @override
  String get ad => 'Product ad';

  @override
  String get noProjects => 'Your next story starts here.';

  @override
  String get noProjectsHint =>
      'Create a project or explore the sample. No account or workstation required.';

  @override
  String get shots => 'Shots';

  @override
  String get characters => 'Cast';

  @override
  String get review => 'Review';

  @override
  String get delivery => 'Export';

  @override
  String get assets => 'Assets';

  @override
  String get importAssets => 'Import assets';

  @override
  String get imported => 'Asset imported';

  @override
  String get shot => 'Shot';

  @override
  String get shotTitle => 'Shot title';

  @override
  String get scene => 'Scene';

  @override
  String get shotType => 'Shot type';

  @override
  String get duration => 'Duration (seconds)';

  @override
  String get dialogue => 'Dialogue / subtitles';

  @override
  String get prompt => 'Generation prompt';

  @override
  String get repairNote => 'Repair instructions';

  @override
  String get voiceover => 'Voiceover';

  @override
  String get sourceAudio => 'Keep source audio';

  @override
  String get generate => 'Generate candidate';

  @override
  String get visualReview => 'Review with vision model';

  @override
  String get visualReviewHelp =>
      'Sends this shot and its references to your configured vision model. Review the result yourself.';

  @override
  String get versions => 'Candidates';

  @override
  String get selectVersion => 'Use this version';

  @override
  String get selected => 'Selected';

  @override
  String get newVersionHint =>
      'New candidates keep the current selected version intact.';

  @override
  String get noMedia => 'No media selected';

  @override
  String get demo => 'Demo asset';

  @override
  String get demoHint => 'Illustrative demo, not an AI-generated result.';

  @override
  String get pending => 'To review';

  @override
  String get approved => 'Approved';

  @override
  String get changes => 'Needs changes';

  @override
  String get queued => 'Queued';

  @override
  String get running => 'Running';

  @override
  String get succeeded => 'Completed';

  @override
  String get failed => 'Failed';

  @override
  String get cancelled => 'Cancelled';

  @override
  String get reviewStatus => 'Review status';

  @override
  String get noTasks => 'The queue is clear.';

  @override
  String get noTasksHint => 'Generation and export tasks will appear here.';

  @override
  String get retry => 'Create new task';

  @override
  String get cancelTask => 'Cancel task';

  @override
  String get render => 'Render MP4';

  @override
  String get archive => 'Package project';

  @override
  String get subtitles => 'Subtitle SRT';

  @override
  String get storyboardCsv => 'Storyboard CSV';

  @override
  String get downloadShare => 'Save / Share';

  @override
  String get exportHelp =>
      'Render selected shots, preserve source audio or voiceover, mix background music and optionally burn subtitles.';

  @override
  String get subtitleTiming =>
      'Applied timed captions use cue times; other shots use script captions. Listen and review before exporting.';

  @override
  String get burnSubtitles => 'Burn subtitles into video';

  @override
  String get backgroundMusic => 'Background music';

  @override
  String get noMusic => 'No background music';

  @override
  String get exportHistory => 'Export history';

  @override
  String get noExports => 'Your first export is on its way.';

  @override
  String get addCharacter => 'Add character';

  @override
  String get characterName => 'Character name';

  @override
  String get characterDescription => 'Appearance, wardrobe and voice';

  @override
  String get reference => 'Reference image';

  @override
  String get noReference => 'No reference yet';

  @override
  String get referenceHint =>
      'References improve guidance, but do not guarantee consistency. Check each shot.';

  @override
  String get checks => 'Production checks';

  @override
  String get noFindings => 'Production checks passed.';

  @override
  String get manualReview =>
      'Preview the full sequence to check faces, wardrobe, scenes and pacing.';

  @override
  String get openShot => 'Open shot';

  @override
  String get agent => 'Director assistant';

  @override
  String get agentHint =>
      'Describe a specific change. The assistant uses your configured model and selected Skill.';

  @override
  String get send => 'Send';

  @override
  String get message => 'Your direction';

  @override
  String get selectSkill => 'Choose a Skill';

  @override
  String get modelSettings => 'Models & API keys';

  @override
  String get generationService => 'Video generation';

  @override
  String get provider => 'Provider';

  @override
  String get endpoint => 'API base URL';

  @override
  String get model => 'Model ID';

  @override
  String get apiKey => 'API key';

  @override
  String get keySaved => 'Key saved. Leave blank to keep it.';

  @override
  String get modelHelp =>
      'API keys use this device’s secure storage. Requests go directly to your provider, who charges generation fees.';

  @override
  String get demoMode => 'Demo mode (no paid generation)';

  @override
  String get gateway => 'Custom task gateway';

  @override
  String get assistantModel => 'Assistant model';

  @override
  String get language => 'Language';

  @override
  String get systemLanguage => 'Follow system';

  @override
  String get english => 'English';

  @override
  String get chinese => '简体中文';

  @override
  String get workstation => 'Workstation';

  @override
  String get disconnect => 'Disconnect';

  @override
  String get connected => 'Connected';

  @override
  String get notConnected => 'Not connected';

  @override
  String get loading => 'Loading your studio…';

  @override
  String get error => 'Something needs attention';

  @override
  String get tryAgain => 'Try again';

  @override
  String get ok => 'OK';

  @override
  String get delete => 'Delete';

  @override
  String get confirmDelete => 'Delete this project? Export a backup first.';

  @override
  String get seconds => 'seconds';

  @override
  String get revision => 'Revision';

  @override
  String get refresh => 'Refresh';

  @override
  String get addShot => 'Add shot';

  @override
  String get localRules =>
      'Rule-based storyboard draft. Use the assistant for model-driven adaptation.';

  @override
  String get invalidServer =>
      'Enter a valid workstation URL without credentials or query parameters.';

  @override
  String get httpsRequired => 'Remote workstations must use HTTPS.';

  @override
  String get invalidResponse => 'The workstation returned an invalid response.';

  @override
  String get requestFailed =>
      'The request failed. Review the connection and try again.';

  @override
  String get connectFirst => 'Connect to your workstation first.';

  @override
  String get downloadFailed =>
      'The download failed. Refresh the project and try again.';

  @override
  String get required => 'This field is required.';

  @override
  String get invalidDuration => 'Use a duration between 2 and 30 seconds.';

  @override
  String get savedToFiles => 'Ready to save or share';

  @override
  String get emptySkills => 'No Skills available';

  @override
  String get approvals => 'External tool requests';

  @override
  String get approve => 'Approve execution';

  @override
  String get reject => 'Reject';

  @override
  String get approvalHint => 'Only approve tools and arguments you recognize.';

  @override
  String get newTask => 'Task queued';

  @override
  String get builtIn => 'Built-in';

  @override
  String get custom => 'Custom';

  @override
  String get originalContent =>
      'Scripts, prompts and asset names keep their original language.';

  @override
  String get localFirst => 'Local studio. Yours to create.';

  @override
  String get localFirstHint =>
      'Projects stay on this device. Bring your own API key when you are ready to generate.';

  @override
  String get openDemo => 'Explore a sample story';

  @override
  String get onDevice => 'Saved on this device';

  @override
  String get trimStart => 'Trim start (seconds)';

  @override
  String get moveShots => 'Arrange shots';

  @override
  String get reorderHelp =>
      'Drag to set the story order. Your candidates stay intact.';

  @override
  String get missingMedia => 'Select media for this shot.';

  @override
  String get missingScene => 'Add a scene description.';

  @override
  String get missingReference => 'Add a character reference.';

  @override
  String get compare => 'Compare candidates';

  @override
  String get configureModel =>
      'Configure your model and API key in Settings first.';

  @override
  String get taskFailed =>
      'Task failed. Check your provider, quota and media, then try again.';

  @override
  String get unknownSubmission =>
      'Submission result is unknown. Check your provider task history before creating a new paid task.';

  @override
  String get exportInterrupted =>
      'Export was interrupted. You can render again from saved shots.';

  @override
  String get remoteMayContinue =>
      'Stopped locally. The provider may continue processing and charging.';

  @override
  String get trimExceedsMedia =>
      'The trim and duration exceed the video length. Shorten the shot or choose another candidate.';

  @override
  String get staleRevision => 'This project changed. Refresh before saving.';

  @override
  String get taskExists => 'This shot already has an active task.';

  @override
  String get unsupportedFile =>
      'Choose a PNG, JPEG, WebP, MP4, MP3, WAV, M4A, TXT or SRT file.';

  @override
  String get imageReviewOnly =>
      'Mobile vision review currently supports selected still images. Review video continuity by playback.';

  @override
  String get hasMedia =>
      'Keep existing candidates safe: duplicate this project before rebuilding the storyboard.';

  @override
  String get importProject => 'Import project backup';

  @override
  String get advanced => 'Advanced tools';

  @override
  String get keepOpen =>
      'Keep the app open during local export. Generation status can be checked again when you return.';

  @override
  String get paidPreview => 'Development preview · payments are not enabled';

  @override
  String get scriptDraft => 'Draft storyboard';

  @override
  String get exportOptions => 'Export options';

  @override
  String get deleteShot => 'Remove shot';

  @override
  String get confirmDeleteShot =>
      'Remove this shot and its candidate links? Imported source files will be kept.';

  @override
  String get production => 'PRODUCTION';

  @override
  String get noScript => 'Add a script, then draft the storyboard.';

  @override
  String get pickMedia => 'Use project media';

  @override
  String get story => 'Story';

  @override
  String get sampleInfo =>
      'Original sample illustrations · not AI generation quality';

  @override
  String get saveFirst => 'Save your edits first.';

  @override
  String get importToShot => 'Add as candidate';

  @override
  String get copyProject => 'Duplicate project';

  @override
  String get skillsHint =>
      'Reusable direction and review instructions for your assistant.';

  @override
  String get costNotice =>
      'Online generation uses your provider credits. New candidates keep the selected cut unchanged.';

  @override
  String get mcpTools => 'MCP & browser tools';

  @override
  String get mcpHelp =>
      'Mobile supports trusted HTTPS Streamable HTTP MCP servers. External tool calls wait for your approval. Local STDIO tools run on desktop.';

  @override
  String get addServer => 'Add server';

  @override
  String get serverName => 'Server name';

  @override
  String get serverToken => 'Bearer token (optional)';

  @override
  String get testTools => 'Discover tools';

  @override
  String get serverUrl => 'MCP server URL';

  @override
  String get skillContent => 'Instructions';

  @override
  String get skillName => 'Skill ID';

  @override
  String get skillDescription => 'Description';

  @override
  String get newSkill => 'Create Skill';

  @override
  String get licenses => 'Open source licenses';

  @override
  String get importProjectPackage => 'Import project package';

  @override
  String get packageImportTitle => 'Pick up where you left off.';

  @override
  String get packageImportHelp =>
      'Restore a separate project with its media, takes and edits. Existing projects stay intact.';

  @override
  String get packageExportTitle => 'Take your project with you.';

  @override
  String get packageExportHelp =>
      'Package your media, cast, takes, edits, completed videos and director conversations for another device.';

  @override
  String get packagePrivacyHint =>
      'Model settings, running generation tasks and tool permissions stay on the original device.';

  @override
  String get packageSizeHint =>
      'ZIP up to 2 GB; each source asset up to 200 MB.';

  @override
  String get chooseProjectPackage => 'Choose a project ZIP';

  @override
  String get importAsNewProject => 'Import as a new project';

  @override
  String get openImportedProject => 'Open imported project';

  @override
  String get shareProjectPackage => 'Share project package';

  @override
  String get packageComplete => 'Project package is ready';

  @override
  String packageSummary(int shots, int assets) {
    return '$shots shots · $assets assets';
  }

  @override
  String get packageSavedHint =>
      'Your saved project stays available even if opening or sharing is interrupted.';

  @override
  String get readingPackage => 'Reading project package…';

  @override
  String get extractingPackage => 'Restoring media…';

  @override
  String get checkingPackage => 'Checking media…';

  @override
  String get savingPackage => 'Saving project…';

  @override
  String get packingProject => 'Packaging project…';

  @override
  String get invalidPackage =>
      'This is a damaged or unsupported Jingxu project package.';

  @override
  String get packageVersion =>
      'Update Jingxu Studio to open this package version.';

  @override
  String get packageTooLarge =>
      'The package exceeds the supported size. Export a smaller project.';

  @override
  String get packageMissingMedia => 'The package is missing referenced media.';

  @override
  String get invalidPackageMedia =>
      'Some media could not be read. Check the source files and export again.';

  @override
  String get packageStorageError =>
      'Project files could not be written. Check storage space and file access.';

  @override
  String get packageCancelled => 'Project transfer cancelled.';

  @override
  String get speechTitle => 'Dialogue voiceover';

  @override
  String get speechSettings => 'Dialogue voice service';

  @override
  String get speechProtocol =>
      'Speech-compatible API returning WAV. Use a model and voice currently supported by your provider.';

  @override
  String get speechVoice => 'Voice ID';

  @override
  String get speechSpeed => 'Speech speed';

  @override
  String get speechModel => 'Speech model ID';

  @override
  String get speechBaseUrl => 'Speech base URL (without audio/speech)';

  @override
  String get speechGenerate => 'Generate voiceover';

  @override
  String get speechReview => 'Hear it. Then make it yours.';

  @override
  String get speechReviewHelp =>
      'Review the dialogue, voice and speed. Listen before selecting the result. Existing tracks and takes are kept.';

  @override
  String get speechSendNotice =>
      'Your dialogue will be sent to your configured service and may incur charges. AI voiceover is saved as a separate asset.';

  @override
  String get speechCreate => 'Confirm and generate';

  @override
  String get speechConfigButton => 'Configure speech service';

  @override
  String get speechTaskAccepted => 'Voiceover task created';

  @override
  String get speechAcceptedHelp =>
      'You can leave this page and check the queue. Keep the app open during local export.';

  @override
  String get speechRefresh => 'Refresh existing task';

  @override
  String get speechRefreshError =>
      'Task created, but refresh failed. Retry refreshes it without submitting again.';

  @override
  String get speechReturn => 'Back to shot to listen and select';

  @override
  String get speechGenerating => 'Generating voiceover';

  @override
  String get speechSaved =>
      'Voiceover saved. Listen before selecting it for the shot.';

  @override
  String get speechUnknownSubmission =>
      'Voiceover status is unknown. Check your provider history before submitting again to avoid duplicate charges.';

  @override
  String get speechTextInvalid =>
      'Enter shot dialogue of up to 3,000 characters.';

  @override
  String get speechTextChanged =>
      'Dialogue changed. Save and review the voiceover request again.';

  @override
  String get configureSpeech =>
      'Configure your speech service URL, model, voice and API key.';

  @override
  String get speechSpeedInvalid => 'Speech speed must be between 0.25 and 4.';

  @override
  String get speechTooLarge => 'Generated audio exceeds the 32 MB limit.';

  @override
  String get speechInvalidAudio =>
      'Your provider did not return valid WAV audio.';

  @override
  String get speechTimeout =>
      'Voiceover timed out. Check your provider history before submitting again.';

  @override
  String get speechFailed =>
      'Voiceover did not complete. Check your settings and provider history before retrying.';

  @override
  String get speechCancelled =>
      'Local voiceover tracking stopped. The provider may continue processing.';

  @override
  String get speechPlay => 'Play voiceover';

  @override
  String get speechPause => 'Pause voiceover';

  @override
  String get speechReplay => 'Replay voiceover';

  @override
  String get speechTrackDuration => 'Track duration';

  @override
  String get speechLongTrack =>
      'Voiceover is longer than the shot and will be cut off. Shorten the dialogue, change the speed or extend the shot, then listen again.';

  @override
  String get speechPlaybackError =>
      'Audio could not play. Check the file or choose another track and retry.';

  @override
  String get speechSeek => 'Voiceover playback position';

  @override
  String get speechRetryNotice =>
      'Recreating uses the currently saved dialogue and speech settings and may incur another charge.';

  @override
  String get speechNewRequest => 'Review a new voiceover request';

  @override
  String speechHttpError(String status) {
    return 'Speech service returned HTTP $status. Check your account and model access.';
  }

  @override
  String get captionsTitle => 'Timed captions';

  @override
  String get captionsIntro =>
      'Edit times relative to this shot. Import desktop transcription or adjust cues manually. Script dialogue is kept.';

  @override
  String get captionStart => 'Start / seconds';

  @override
  String get captionEnd => 'End / seconds';

  @override
  String get captionText => 'Caption text';

  @override
  String get captionAdd => 'Add cue';

  @override
  String get captionApply => 'Apply timed captions';

  @override
  String get captionFallback => 'Use script captions';

  @override
  String get captionFromDialogue => 'Start from script dialogue';

  @override
  String get captionEmpty =>
      'This track is empty. Applying it hides captions for this shot.';

  @override
  String get invalidCaptions =>
      'Cue times must be ordered, non-overlapping and within the shot duration. Each cue needs text.';

  @override
  String get captionStale =>
      'The audio or edit changed. Realign captions or switch to script captions before exporting.';

  @override
  String get captionSavedRefresh =>
      'Captions saved, but refresh failed. Retry only refreshes the project.';

  @override
  String get captionRefresh => 'Refresh saved captions';

  @override
  String get captionNoMedia =>
      'Select a shot asset before creating timed captions.';

  @override
  String get captionCurrentSource => 'Current shot source';

  @override
  String get captionRemove => 'Delete cue';

  @override
  String get shotGeneration => 'Generate shot media';

  @override
  String get generateImage => 'Generate image';

  @override
  String get animateImage => 'Animate selected image';

  @override
  String get imageProvider => 'Image generation';

  @override
  String get firstFrameTask => 'First-frame video';

  @override
  String get imageReview => 'Review image generation';

  @override
  String get firstFrameReview => 'Review first-frame video';

  @override
  String get generationSendNotice =>
      'Review what will be sent to your provider. Generation may incur charges.';

  @override
  String get generationImages => 'Images to send';

  @override
  String get generationNoReferences => 'No reference images';

  @override
  String get generationPrompt => 'Prompt to send';

  @override
  String get generationConfirm => 'Confirm and queue';

  @override
  String get generationRefresh => 'Refresh';

  @override
  String get backToShot => 'Back to shot';

  @override
  String get configureImage =>
      'Set the Seedream base URL, model ID and API key in Settings.';

  @override
  String get configureFirstFrame =>
      'Configure a Seedance video provider to animate the selected image.';

  @override
  String get seedreamSettingsHelp =>
      'Use an enabled Seedream model for shot and cast references.';

  @override
  String get imageBaseUrl => 'Base URL without /images/generations';

  @override
  String get clearImageKey => 'Clear saved image API key';

  @override
  String get firstFrameAspect => 'Aspect ratio follows the image';

  @override
  String get generationChanged =>
      'The project or provider changed. Refresh and review again.';

  @override
  String get imagePromptRequired => 'Save a shot prompt first.';

  @override
  String get imageReferenceLimit =>
      'Image generation supports up to 10 reference images.';

  @override
  String get imageReferenceInvalid =>
      'Reference must be a project PNG, JPEG or WebP image.';

  @override
  String get imageReferencesTooLarge =>
      'Reference images exceed the upload limit.';

  @override
  String get imageInvalid => 'The service returned an unreadable image.';

  @override
  String get imageResponseTooLarge =>
      'The image response is larger than 28 MB.';

  @override
  String get generationSubmitting =>
      'Submitting to the provider. Please avoid a duplicate request.';

  @override
  String get generationPolling => 'Remote task accepted. Waiting for video.';

  @override
  String get generationCandidateSaved =>
      'Candidate saved. Review it in the shot’s versions.';

  @override
  String get generationReviewAgain =>
      'Check your provider’s history before submitting again from the shot.';

  @override
  String get remoteGenerationId => 'Provider task ID';

  @override
  String generationHttpError(String status) {
    return 'Provider returned HTTP $status. Check your account and model access.';
  }

  @override
  String get generationVideoInvalid =>
      'The provider did not return a readable MP4.';

  @override
  String get generationRemoteFailed =>
      'The provider reports that this task failed.';

  @override
  String get generationTimedOut =>
      'Video generation timed out. Check the provider’s task history.';

  @override
  String get generationDownloadFailed =>
      'The provider’s video download failed.';
}
