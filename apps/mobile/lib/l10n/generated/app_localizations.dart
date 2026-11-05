import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('zh'),
  ];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'Jingxu Studio'**
  String get appName;

  /// No description provided for @tagline.
  ///
  /// In en, this message translates to:
  /// **'Make every shot worth delivering.'**
  String get tagline;

  /// No description provided for @projects.
  ///
  /// In en, this message translates to:
  /// **'Projects'**
  String get projects;

  /// No description provided for @tasks.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get tasks;

  /// No description provided for @skills.
  ///
  /// In en, this message translates to:
  /// **'Skills'**
  String get skills;

  /// No description provided for @settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// No description provided for @connect.
  ///
  /// In en, this message translates to:
  /// **'Connect workstation'**
  String get connect;

  /// No description provided for @connectIntro.
  ///
  /// In en, this message translates to:
  /// **'Optional remote tools never replace your local project library.'**
  String get connectIntro;

  /// No description provided for @serverAddress.
  ///
  /// In en, this message translates to:
  /// **'Workstation URL'**
  String get serverAddress;

  /// No description provided for @pairingToken.
  ///
  /// In en, this message translates to:
  /// **'Pairing token'**
  String get pairingToken;

  /// No description provided for @connectionHelp.
  ///
  /// In en, this message translates to:
  /// **'Use your HTTPS workstation address and its pairing token. Find the token in desktop Settings → Pairing.'**
  String get connectionHelp;

  /// No description provided for @connecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting…'**
  String get connecting;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get save;

  /// No description provided for @saved.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get saved;

  /// No description provided for @create.
  ///
  /// In en, this message translates to:
  /// **'Create project'**
  String get create;

  /// No description provided for @newProject.
  ///
  /// In en, this message translates to:
  /// **'Start a new story'**
  String get newProject;

  /// No description provided for @projectName.
  ///
  /// In en, this message translates to:
  /// **'Project name'**
  String get projectName;

  /// No description provided for @description.
  ///
  /// In en, this message translates to:
  /// **'Story brief'**
  String get description;

  /// No description provided for @script.
  ///
  /// In en, this message translates to:
  /// **'Script'**
  String get script;

  /// No description provided for @scriptHint.
  ///
  /// In en, this message translates to:
  /// **'One scene or line of dialogue per paragraph. You can refine the storyboard later.'**
  String get scriptHint;

  /// No description provided for @format.
  ///
  /// In en, this message translates to:
  /// **'Aspect ratio'**
  String get format;

  /// No description provided for @style.
  ///
  /// In en, this message translates to:
  /// **'Visual style'**
  String get style;

  /// No description provided for @cinematic.
  ///
  /// In en, this message translates to:
  /// **'Cinematic'**
  String get cinematic;

  /// No description provided for @animation.
  ///
  /// In en, this message translates to:
  /// **'Animation'**
  String get animation;

  /// No description provided for @ad.
  ///
  /// In en, this message translates to:
  /// **'Product ad'**
  String get ad;

  /// No description provided for @noProjects.
  ///
  /// In en, this message translates to:
  /// **'Your next story starts here.'**
  String get noProjects;

  /// No description provided for @noProjectsHint.
  ///
  /// In en, this message translates to:
  /// **'Create a project or explore the sample. No account or workstation required.'**
  String get noProjectsHint;

  /// No description provided for @shots.
  ///
  /// In en, this message translates to:
  /// **'Shots'**
  String get shots;

  /// No description provided for @characters.
  ///
  /// In en, this message translates to:
  /// **'Cast'**
  String get characters;

  /// No description provided for @review.
  ///
  /// In en, this message translates to:
  /// **'Review'**
  String get review;

  /// No description provided for @delivery.
  ///
  /// In en, this message translates to:
  /// **'Export'**
  String get delivery;

  /// No description provided for @assets.
  ///
  /// In en, this message translates to:
  /// **'Assets'**
  String get assets;

  /// No description provided for @importAssets.
  ///
  /// In en, this message translates to:
  /// **'Import assets'**
  String get importAssets;

  /// No description provided for @imported.
  ///
  /// In en, this message translates to:
  /// **'Asset imported'**
  String get imported;

  /// No description provided for @shot.
  ///
  /// In en, this message translates to:
  /// **'Shot'**
  String get shot;

  /// No description provided for @shotTitle.
  ///
  /// In en, this message translates to:
  /// **'Shot title'**
  String get shotTitle;

  /// No description provided for @scene.
  ///
  /// In en, this message translates to:
  /// **'Scene'**
  String get scene;

  /// No description provided for @shotType.
  ///
  /// In en, this message translates to:
  /// **'Shot type'**
  String get shotType;

  /// No description provided for @duration.
  ///
  /// In en, this message translates to:
  /// **'Duration (seconds)'**
  String get duration;

  /// No description provided for @dialogue.
  ///
  /// In en, this message translates to:
  /// **'Dialogue / subtitles'**
  String get dialogue;

  /// No description provided for @prompt.
  ///
  /// In en, this message translates to:
  /// **'Generation prompt'**
  String get prompt;

  /// No description provided for @repairNote.
  ///
  /// In en, this message translates to:
  /// **'Repair instructions'**
  String get repairNote;

  /// No description provided for @voiceover.
  ///
  /// In en, this message translates to:
  /// **'Voiceover'**
  String get voiceover;

  /// No description provided for @sourceAudio.
  ///
  /// In en, this message translates to:
  /// **'Keep source audio'**
  String get sourceAudio;

  /// No description provided for @generate.
  ///
  /// In en, this message translates to:
  /// **'Generate candidate'**
  String get generate;

  /// No description provided for @visualReview.
  ///
  /// In en, this message translates to:
  /// **'Review with vision model'**
  String get visualReview;

  /// No description provided for @visualReviewHelp.
  ///
  /// In en, this message translates to:
  /// **'Sends this shot and its references to your configured vision model. Review the result yourself.'**
  String get visualReviewHelp;

  /// No description provided for @versions.
  ///
  /// In en, this message translates to:
  /// **'Candidates'**
  String get versions;

  /// No description provided for @selectVersion.
  ///
  /// In en, this message translates to:
  /// **'Use this version'**
  String get selectVersion;

  /// No description provided for @selected.
  ///
  /// In en, this message translates to:
  /// **'Selected'**
  String get selected;

  /// No description provided for @newVersionHint.
  ///
  /// In en, this message translates to:
  /// **'New candidates keep the current selected version intact.'**
  String get newVersionHint;

  /// No description provided for @noMedia.
  ///
  /// In en, this message translates to:
  /// **'No media selected'**
  String get noMedia;

  /// No description provided for @demo.
  ///
  /// In en, this message translates to:
  /// **'Demo asset'**
  String get demo;

  /// No description provided for @demoHint.
  ///
  /// In en, this message translates to:
  /// **'Illustrative demo, not an AI-generated result.'**
  String get demoHint;

  /// No description provided for @pending.
  ///
  /// In en, this message translates to:
  /// **'To review'**
  String get pending;

  /// No description provided for @approved.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get approved;

  /// No description provided for @changes.
  ///
  /// In en, this message translates to:
  /// **'Needs changes'**
  String get changes;

  /// No description provided for @queued.
  ///
  /// In en, this message translates to:
  /// **'Queued'**
  String get queued;

  /// No description provided for @running.
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get running;

  /// No description provided for @succeeded.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get succeeded;

  /// No description provided for @failed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get failed;

  /// No description provided for @cancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get cancelled;

  /// No description provided for @reviewStatus.
  ///
  /// In en, this message translates to:
  /// **'Review status'**
  String get reviewStatus;

  /// No description provided for @noTasks.
  ///
  /// In en, this message translates to:
  /// **'The queue is clear.'**
  String get noTasks;

  /// No description provided for @noTasksHint.
  ///
  /// In en, this message translates to:
  /// **'Generation and export tasks will appear here.'**
  String get noTasksHint;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Create new task'**
  String get retry;

  /// No description provided for @cancelTask.
  ///
  /// In en, this message translates to:
  /// **'Cancel task'**
  String get cancelTask;

  /// No description provided for @render.
  ///
  /// In en, this message translates to:
  /// **'Render MP4'**
  String get render;

  /// No description provided for @archive.
  ///
  /// In en, this message translates to:
  /// **'Package project'**
  String get archive;

  /// No description provided for @subtitles.
  ///
  /// In en, this message translates to:
  /// **'Subtitle SRT'**
  String get subtitles;

  /// No description provided for @storyboardCsv.
  ///
  /// In en, this message translates to:
  /// **'Storyboard CSV'**
  String get storyboardCsv;

  /// No description provided for @downloadShare.
  ///
  /// In en, this message translates to:
  /// **'Save / Share'**
  String get downloadShare;

  /// No description provided for @exportHelp.
  ///
  /// In en, this message translates to:
  /// **'Render selected shots, preserve source audio or voiceover, mix background music and optionally burn subtitles.'**
  String get exportHelp;

  /// No description provided for @subtitleTiming.
  ///
  /// In en, this message translates to:
  /// **'Applied timed captions use cue times; other shots use script captions. Listen and review before exporting.'**
  String get subtitleTiming;

  /// No description provided for @burnSubtitles.
  ///
  /// In en, this message translates to:
  /// **'Burn subtitles into video'**
  String get burnSubtitles;

  /// No description provided for @backgroundMusic.
  ///
  /// In en, this message translates to:
  /// **'Background music'**
  String get backgroundMusic;

  /// No description provided for @noMusic.
  ///
  /// In en, this message translates to:
  /// **'No background music'**
  String get noMusic;

  /// No description provided for @exportHistory.
  ///
  /// In en, this message translates to:
  /// **'Export history'**
  String get exportHistory;

  /// No description provided for @noExports.
  ///
  /// In en, this message translates to:
  /// **'Your first export is on its way.'**
  String get noExports;

  /// No description provided for @addCharacter.
  ///
  /// In en, this message translates to:
  /// **'Add character'**
  String get addCharacter;

  /// No description provided for @characterName.
  ///
  /// In en, this message translates to:
  /// **'Character name'**
  String get characterName;

  /// No description provided for @characterDescription.
  ///
  /// In en, this message translates to:
  /// **'Appearance, wardrobe and voice'**
  String get characterDescription;

  /// No description provided for @reference.
  ///
  /// In en, this message translates to:
  /// **'Reference image'**
  String get reference;

  /// No description provided for @noReference.
  ///
  /// In en, this message translates to:
  /// **'No reference yet'**
  String get noReference;

  /// No description provided for @referenceHint.
  ///
  /// In en, this message translates to:
  /// **'References improve guidance, but do not guarantee consistency. Check each shot.'**
  String get referenceHint;

  /// No description provided for @checks.
  ///
  /// In en, this message translates to:
  /// **'Production checks'**
  String get checks;

  /// No description provided for @noFindings.
  ///
  /// In en, this message translates to:
  /// **'Production checks passed.'**
  String get noFindings;

  /// No description provided for @manualReview.
  ///
  /// In en, this message translates to:
  /// **'Preview the full sequence to check faces, wardrobe, scenes and pacing.'**
  String get manualReview;

  /// No description provided for @openShot.
  ///
  /// In en, this message translates to:
  /// **'Open shot'**
  String get openShot;

  /// No description provided for @agent.
  ///
  /// In en, this message translates to:
  /// **'Director assistant'**
  String get agent;

  /// No description provided for @agentHint.
  ///
  /// In en, this message translates to:
  /// **'Describe a specific change. The assistant uses your configured model and selected Skill.'**
  String get agentHint;

  /// No description provided for @send.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get send;

  /// No description provided for @message.
  ///
  /// In en, this message translates to:
  /// **'Your direction'**
  String get message;

  /// No description provided for @selectSkill.
  ///
  /// In en, this message translates to:
  /// **'Choose a Skill'**
  String get selectSkill;

  /// No description provided for @modelSettings.
  ///
  /// In en, this message translates to:
  /// **'Models & API keys'**
  String get modelSettings;

  /// No description provided for @generationService.
  ///
  /// In en, this message translates to:
  /// **'Video generation'**
  String get generationService;

  /// No description provided for @provider.
  ///
  /// In en, this message translates to:
  /// **'Provider'**
  String get provider;

  /// No description provided for @endpoint.
  ///
  /// In en, this message translates to:
  /// **'API base URL'**
  String get endpoint;

  /// No description provided for @model.
  ///
  /// In en, this message translates to:
  /// **'Model ID'**
  String get model;

  /// No description provided for @apiKey.
  ///
  /// In en, this message translates to:
  /// **'API key'**
  String get apiKey;

  /// No description provided for @keySaved.
  ///
  /// In en, this message translates to:
  /// **'Key saved. Leave blank to keep it.'**
  String get keySaved;

  /// No description provided for @modelHelp.
  ///
  /// In en, this message translates to:
  /// **'API keys use this device’s secure storage. Requests go directly to your provider, who charges generation fees.'**
  String get modelHelp;

  /// No description provided for @demoMode.
  ///
  /// In en, this message translates to:
  /// **'Demo mode (no paid generation)'**
  String get demoMode;

  /// No description provided for @gateway.
  ///
  /// In en, this message translates to:
  /// **'Custom task gateway'**
  String get gateway;

  /// No description provided for @assistantModel.
  ///
  /// In en, this message translates to:
  /// **'Assistant model'**
  String get assistantModel;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @systemLanguage.
  ///
  /// In en, this message translates to:
  /// **'Follow system'**
  String get systemLanguage;

  /// No description provided for @english.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get english;

  /// No description provided for @chinese.
  ///
  /// In en, this message translates to:
  /// **'简体中文'**
  String get chinese;

  /// No description provided for @workstation.
  ///
  /// In en, this message translates to:
  /// **'Workstation'**
  String get workstation;

  /// No description provided for @disconnect.
  ///
  /// In en, this message translates to:
  /// **'Disconnect'**
  String get disconnect;

  /// No description provided for @connected.
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get connected;

  /// No description provided for @notConnected.
  ///
  /// In en, this message translates to:
  /// **'Not connected'**
  String get notConnected;

  /// No description provided for @loading.
  ///
  /// In en, this message translates to:
  /// **'Loading your studio…'**
  String get loading;

  /// No description provided for @error.
  ///
  /// In en, this message translates to:
  /// **'Something needs attention'**
  String get error;

  /// No description provided for @tryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get tryAgain;

  /// No description provided for @ok.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get ok;

  /// No description provided for @delete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get delete;

  /// No description provided for @confirmDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete this project? Export a backup first.'**
  String get confirmDelete;

  /// No description provided for @seconds.
  ///
  /// In en, this message translates to:
  /// **'seconds'**
  String get seconds;

  /// No description provided for @revision.
  ///
  /// In en, this message translates to:
  /// **'Revision'**
  String get revision;

  /// No description provided for @refresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refresh;

  /// No description provided for @addShot.
  ///
  /// In en, this message translates to:
  /// **'Add shot'**
  String get addShot;

  /// No description provided for @localRules.
  ///
  /// In en, this message translates to:
  /// **'Rule-based storyboard draft. Use the assistant for model-driven adaptation.'**
  String get localRules;

  /// No description provided for @invalidServer.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid workstation URL without credentials or query parameters.'**
  String get invalidServer;

  /// No description provided for @httpsRequired.
  ///
  /// In en, this message translates to:
  /// **'Remote workstations must use HTTPS.'**
  String get httpsRequired;

  /// No description provided for @invalidResponse.
  ///
  /// In en, this message translates to:
  /// **'The workstation returned an invalid response.'**
  String get invalidResponse;

  /// No description provided for @requestFailed.
  ///
  /// In en, this message translates to:
  /// **'The request failed. Review the connection and try again.'**
  String get requestFailed;

  /// No description provided for @connectFirst.
  ///
  /// In en, this message translates to:
  /// **'Connect to your workstation first.'**
  String get connectFirst;

  /// No description provided for @downloadFailed.
  ///
  /// In en, this message translates to:
  /// **'The download failed. Refresh the project and try again.'**
  String get downloadFailed;

  /// No description provided for @required.
  ///
  /// In en, this message translates to:
  /// **'This field is required.'**
  String get required;

  /// No description provided for @invalidDuration.
  ///
  /// In en, this message translates to:
  /// **'Use a duration between 2 and 30 seconds.'**
  String get invalidDuration;

  /// No description provided for @savedToFiles.
  ///
  /// In en, this message translates to:
  /// **'Ready to save or share'**
  String get savedToFiles;

  /// No description provided for @emptySkills.
  ///
  /// In en, this message translates to:
  /// **'No Skills available'**
  String get emptySkills;

  /// No description provided for @approvals.
  ///
  /// In en, this message translates to:
  /// **'External tool requests'**
  String get approvals;

  /// No description provided for @approve.
  ///
  /// In en, this message translates to:
  /// **'Approve execution'**
  String get approve;

  /// No description provided for @reject.
  ///
  /// In en, this message translates to:
  /// **'Reject'**
  String get reject;

  /// No description provided for @approvalHint.
  ///
  /// In en, this message translates to:
  /// **'Only approve tools and arguments you recognize.'**
  String get approvalHint;

  /// No description provided for @newTask.
  ///
  /// In en, this message translates to:
  /// **'Task queued'**
  String get newTask;

  /// No description provided for @builtIn.
  ///
  /// In en, this message translates to:
  /// **'Built-in'**
  String get builtIn;

  /// No description provided for @custom.
  ///
  /// In en, this message translates to:
  /// **'Custom'**
  String get custom;

  /// No description provided for @originalContent.
  ///
  /// In en, this message translates to:
  /// **'Scripts, prompts and asset names keep their original language.'**
  String get originalContent;

  /// No description provided for @localFirst.
  ///
  /// In en, this message translates to:
  /// **'Local studio. Yours to create.'**
  String get localFirst;

  /// No description provided for @localFirstHint.
  ///
  /// In en, this message translates to:
  /// **'Projects stay on this device. Bring your own API key when you are ready to generate.'**
  String get localFirstHint;

  /// No description provided for @openDemo.
  ///
  /// In en, this message translates to:
  /// **'Explore a sample story'**
  String get openDemo;

  /// No description provided for @onDevice.
  ///
  /// In en, this message translates to:
  /// **'Saved on this device'**
  String get onDevice;

  /// No description provided for @trimStart.
  ///
  /// In en, this message translates to:
  /// **'Trim start (seconds)'**
  String get trimStart;

  /// No description provided for @moveShots.
  ///
  /// In en, this message translates to:
  /// **'Arrange shots'**
  String get moveShots;

  /// No description provided for @reorderHelp.
  ///
  /// In en, this message translates to:
  /// **'Drag to set the story order. Your candidates stay intact.'**
  String get reorderHelp;

  /// No description provided for @missingMedia.
  ///
  /// In en, this message translates to:
  /// **'Select media for this shot.'**
  String get missingMedia;

  /// No description provided for @missingScene.
  ///
  /// In en, this message translates to:
  /// **'Add a scene description.'**
  String get missingScene;

  /// No description provided for @missingReference.
  ///
  /// In en, this message translates to:
  /// **'Add a character reference.'**
  String get missingReference;

  /// No description provided for @compare.
  ///
  /// In en, this message translates to:
  /// **'Compare candidates'**
  String get compare;

  /// No description provided for @configureModel.
  ///
  /// In en, this message translates to:
  /// **'Configure your model and API key in Settings first.'**
  String get configureModel;

  /// No description provided for @taskFailed.
  ///
  /// In en, this message translates to:
  /// **'Task failed. Check your provider, quota and media, then try again.'**
  String get taskFailed;

  /// No description provided for @unknownSubmission.
  ///
  /// In en, this message translates to:
  /// **'Submission result is unknown. Check your provider task history before creating a new paid task.'**
  String get unknownSubmission;

  /// No description provided for @exportInterrupted.
  ///
  /// In en, this message translates to:
  /// **'Export was interrupted. You can render again from saved shots.'**
  String get exportInterrupted;

  /// No description provided for @remoteMayContinue.
  ///
  /// In en, this message translates to:
  /// **'Stopped locally. The provider may continue processing and charging.'**
  String get remoteMayContinue;

  /// No description provided for @trimExceedsMedia.
  ///
  /// In en, this message translates to:
  /// **'The trim and duration exceed the video length. Shorten the shot or choose another candidate.'**
  String get trimExceedsMedia;

  /// No description provided for @staleRevision.
  ///
  /// In en, this message translates to:
  /// **'This project changed. Refresh before saving.'**
  String get staleRevision;

  /// No description provided for @taskExists.
  ///
  /// In en, this message translates to:
  /// **'This shot already has an active task.'**
  String get taskExists;

  /// No description provided for @unsupportedFile.
  ///
  /// In en, this message translates to:
  /// **'Choose a PNG, JPEG, WebP, MP4, MP3, WAV, M4A, TXT or SRT file.'**
  String get unsupportedFile;

  /// No description provided for @imageReviewOnly.
  ///
  /// In en, this message translates to:
  /// **'Mobile vision review currently supports selected still images. Review video continuity by playback.'**
  String get imageReviewOnly;

  /// No description provided for @hasMedia.
  ///
  /// In en, this message translates to:
  /// **'Keep existing candidates safe: duplicate this project before rebuilding the storyboard.'**
  String get hasMedia;

  /// No description provided for @importProject.
  ///
  /// In en, this message translates to:
  /// **'Import project backup'**
  String get importProject;

  /// No description provided for @advanced.
  ///
  /// In en, this message translates to:
  /// **'Advanced tools'**
  String get advanced;

  /// No description provided for @keepOpen.
  ///
  /// In en, this message translates to:
  /// **'Keep the app open during local export. Generation status can be checked again when you return.'**
  String get keepOpen;

  /// No description provided for @paidPreview.
  ///
  /// In en, this message translates to:
  /// **'Development preview · payments are not enabled'**
  String get paidPreview;

  /// No description provided for @scriptDraft.
  ///
  /// In en, this message translates to:
  /// **'Draft storyboard'**
  String get scriptDraft;

  /// No description provided for @exportOptions.
  ///
  /// In en, this message translates to:
  /// **'Export options'**
  String get exportOptions;

  /// No description provided for @deleteShot.
  ///
  /// In en, this message translates to:
  /// **'Remove shot'**
  String get deleteShot;

  /// No description provided for @confirmDeleteShot.
  ///
  /// In en, this message translates to:
  /// **'Remove this shot and its candidate links? Imported source files will be kept.'**
  String get confirmDeleteShot;

  /// No description provided for @production.
  ///
  /// In en, this message translates to:
  /// **'PRODUCTION'**
  String get production;

  /// No description provided for @noScript.
  ///
  /// In en, this message translates to:
  /// **'Add a script, then draft the storyboard.'**
  String get noScript;

  /// No description provided for @pickMedia.
  ///
  /// In en, this message translates to:
  /// **'Use project media'**
  String get pickMedia;

  /// No description provided for @story.
  ///
  /// In en, this message translates to:
  /// **'Story'**
  String get story;

  /// No description provided for @sampleInfo.
  ///
  /// In en, this message translates to:
  /// **'Original sample illustrations · not AI generation quality'**
  String get sampleInfo;

  /// No description provided for @saveFirst.
  ///
  /// In en, this message translates to:
  /// **'Save your edits first.'**
  String get saveFirst;

  /// No description provided for @importToShot.
  ///
  /// In en, this message translates to:
  /// **'Add as candidate'**
  String get importToShot;

  /// No description provided for @copyProject.
  ///
  /// In en, this message translates to:
  /// **'Duplicate project'**
  String get copyProject;

  /// No description provided for @skillsHint.
  ///
  /// In en, this message translates to:
  /// **'Reusable direction and review instructions for your assistant.'**
  String get skillsHint;

  /// No description provided for @costNotice.
  ///
  /// In en, this message translates to:
  /// **'Online generation uses your provider credits. New candidates keep the selected cut unchanged.'**
  String get costNotice;

  /// No description provided for @mcpTools.
  ///
  /// In en, this message translates to:
  /// **'MCP & browser tools'**
  String get mcpTools;

  /// No description provided for @mcpHelp.
  ///
  /// In en, this message translates to:
  /// **'Mobile supports trusted HTTPS Streamable HTTP MCP servers. External tool calls wait for your approval. Local STDIO tools run on desktop.'**
  String get mcpHelp;

  /// No description provided for @addServer.
  ///
  /// In en, this message translates to:
  /// **'Add server'**
  String get addServer;

  /// No description provided for @serverName.
  ///
  /// In en, this message translates to:
  /// **'Server name'**
  String get serverName;

  /// No description provided for @serverToken.
  ///
  /// In en, this message translates to:
  /// **'Bearer token (optional)'**
  String get serverToken;

  /// No description provided for @testTools.
  ///
  /// In en, this message translates to:
  /// **'Discover tools'**
  String get testTools;

  /// No description provided for @serverUrl.
  ///
  /// In en, this message translates to:
  /// **'MCP server URL'**
  String get serverUrl;

  /// No description provided for @skillContent.
  ///
  /// In en, this message translates to:
  /// **'Instructions'**
  String get skillContent;

  /// No description provided for @skillName.
  ///
  /// In en, this message translates to:
  /// **'Skill ID'**
  String get skillName;

  /// No description provided for @skillDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get skillDescription;

  /// No description provided for @newSkill.
  ///
  /// In en, this message translates to:
  /// **'Create Skill'**
  String get newSkill;

  /// No description provided for @licenses.
  ///
  /// In en, this message translates to:
  /// **'Open source licenses'**
  String get licenses;

  /// No description provided for @importProjectPackage.
  ///
  /// In en, this message translates to:
  /// **'Import project package'**
  String get importProjectPackage;

  /// No description provided for @packageImportTitle.
  ///
  /// In en, this message translates to:
  /// **'Pick up where you left off.'**
  String get packageImportTitle;

  /// No description provided for @packageImportHelp.
  ///
  /// In en, this message translates to:
  /// **'Restore a separate project with its media, takes and edits. Existing projects stay intact.'**
  String get packageImportHelp;

  /// No description provided for @packageExportTitle.
  ///
  /// In en, this message translates to:
  /// **'Take your project with you.'**
  String get packageExportTitle;

  /// No description provided for @packageExportHelp.
  ///
  /// In en, this message translates to:
  /// **'Package your media, cast, takes, edits, completed videos and director conversations for another device.'**
  String get packageExportHelp;

  /// No description provided for @packagePrivacyHint.
  ///
  /// In en, this message translates to:
  /// **'Model settings, running generation tasks and tool permissions stay on the original device.'**
  String get packagePrivacyHint;

  /// No description provided for @packageSizeHint.
  ///
  /// In en, this message translates to:
  /// **'ZIP up to 2 GB; each source asset up to 200 MB.'**
  String get packageSizeHint;

  /// No description provided for @chooseProjectPackage.
  ///
  /// In en, this message translates to:
  /// **'Choose a project ZIP'**
  String get chooseProjectPackage;

  /// No description provided for @importAsNewProject.
  ///
  /// In en, this message translates to:
  /// **'Import as a new project'**
  String get importAsNewProject;

  /// No description provided for @openImportedProject.
  ///
  /// In en, this message translates to:
  /// **'Open imported project'**
  String get openImportedProject;

  /// No description provided for @shareProjectPackage.
  ///
  /// In en, this message translates to:
  /// **'Share project package'**
  String get shareProjectPackage;

  /// No description provided for @packageComplete.
  ///
  /// In en, this message translates to:
  /// **'Project package is ready'**
  String get packageComplete;

  /// No description provided for @packageSummary.
  ///
  /// In en, this message translates to:
  /// **'{shots} shots · {assets} assets'**
  String packageSummary(int shots, int assets);

  /// No description provided for @packageSavedHint.
  ///
  /// In en, this message translates to:
  /// **'Your saved project stays available even if opening or sharing is interrupted.'**
  String get packageSavedHint;

  /// No description provided for @readingPackage.
  ///
  /// In en, this message translates to:
  /// **'Reading project package…'**
  String get readingPackage;

  /// No description provided for @extractingPackage.
  ///
  /// In en, this message translates to:
  /// **'Restoring media…'**
  String get extractingPackage;

  /// No description provided for @checkingPackage.
  ///
  /// In en, this message translates to:
  /// **'Checking media…'**
  String get checkingPackage;

  /// No description provided for @savingPackage.
  ///
  /// In en, this message translates to:
  /// **'Saving project…'**
  String get savingPackage;

  /// No description provided for @packingProject.
  ///
  /// In en, this message translates to:
  /// **'Packaging project…'**
  String get packingProject;

  /// No description provided for @invalidPackage.
  ///
  /// In en, this message translates to:
  /// **'This is a damaged or unsupported Jingxu project package.'**
  String get invalidPackage;

  /// No description provided for @packageVersion.
  ///
  /// In en, this message translates to:
  /// **'Update Jingxu Studio to open this package version.'**
  String get packageVersion;

  /// No description provided for @packageTooLarge.
  ///
  /// In en, this message translates to:
  /// **'The package exceeds the supported size. Export a smaller project.'**
  String get packageTooLarge;

  /// No description provided for @packageMissingMedia.
  ///
  /// In en, this message translates to:
  /// **'The package is missing referenced media.'**
  String get packageMissingMedia;

  /// No description provided for @invalidPackageMedia.
  ///
  /// In en, this message translates to:
  /// **'Some media could not be read. Check the source files and export again.'**
  String get invalidPackageMedia;

  /// No description provided for @packageStorageError.
  ///
  /// In en, this message translates to:
  /// **'Project files could not be written. Check storage space and file access.'**
  String get packageStorageError;

  /// No description provided for @packageCancelled.
  ///
  /// In en, this message translates to:
  /// **'Project transfer cancelled.'**
  String get packageCancelled;

  /// No description provided for @speechTitle.
  ///
  /// In en, this message translates to:
  /// **'Dialogue voiceover'**
  String get speechTitle;

  /// No description provided for @speechSettings.
  ///
  /// In en, this message translates to:
  /// **'Dialogue voice service'**
  String get speechSettings;

  /// No description provided for @speechProtocol.
  ///
  /// In en, this message translates to:
  /// **'Speech-compatible API returning WAV. Use a model and voice currently supported by your provider.'**
  String get speechProtocol;

  /// No description provided for @speechVoice.
  ///
  /// In en, this message translates to:
  /// **'Voice ID'**
  String get speechVoice;

  /// No description provided for @speechSpeed.
  ///
  /// In en, this message translates to:
  /// **'Speech speed'**
  String get speechSpeed;

  /// No description provided for @speechModel.
  ///
  /// In en, this message translates to:
  /// **'Speech model ID'**
  String get speechModel;

  /// No description provided for @speechBaseUrl.
  ///
  /// In en, this message translates to:
  /// **'Speech base URL (without audio/speech)'**
  String get speechBaseUrl;

  /// No description provided for @speechGenerate.
  ///
  /// In en, this message translates to:
  /// **'Generate voiceover'**
  String get speechGenerate;

  /// No description provided for @speechReview.
  ///
  /// In en, this message translates to:
  /// **'Hear it. Then make it yours.'**
  String get speechReview;

  /// No description provided for @speechReviewHelp.
  ///
  /// In en, this message translates to:
  /// **'Review the dialogue, voice and speed. Listen before selecting the result. Existing tracks and takes are kept.'**
  String get speechReviewHelp;

  /// No description provided for @speechSendNotice.
  ///
  /// In en, this message translates to:
  /// **'Your dialogue will be sent to your configured service and may incur charges. AI voiceover is saved as a separate asset.'**
  String get speechSendNotice;

  /// No description provided for @speechCreate.
  ///
  /// In en, this message translates to:
  /// **'Confirm and generate'**
  String get speechCreate;

  /// No description provided for @speechConfigButton.
  ///
  /// In en, this message translates to:
  /// **'Configure speech service'**
  String get speechConfigButton;

  /// No description provided for @speechTaskAccepted.
  ///
  /// In en, this message translates to:
  /// **'Voiceover task created'**
  String get speechTaskAccepted;

  /// No description provided for @speechAcceptedHelp.
  ///
  /// In en, this message translates to:
  /// **'You can leave this page and check the queue. Keep the app open during local export.'**
  String get speechAcceptedHelp;

  /// No description provided for @speechRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh existing task'**
  String get speechRefresh;

  /// No description provided for @speechRefreshError.
  ///
  /// In en, this message translates to:
  /// **'Task created, but refresh failed. Retry refreshes it without submitting again.'**
  String get speechRefreshError;

  /// No description provided for @speechReturn.
  ///
  /// In en, this message translates to:
  /// **'Back to shot to listen and select'**
  String get speechReturn;

  /// No description provided for @speechGenerating.
  ///
  /// In en, this message translates to:
  /// **'Generating voiceover'**
  String get speechGenerating;

  /// No description provided for @speechSaved.
  ///
  /// In en, this message translates to:
  /// **'Voiceover saved. Listen before selecting it for the shot.'**
  String get speechSaved;

  /// No description provided for @speechUnknownSubmission.
  ///
  /// In en, this message translates to:
  /// **'Voiceover status is unknown. Check your provider history before submitting again to avoid duplicate charges.'**
  String get speechUnknownSubmission;

  /// No description provided for @speechTextInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter shot dialogue of up to 3,000 characters.'**
  String get speechTextInvalid;

  /// No description provided for @speechTextChanged.
  ///
  /// In en, this message translates to:
  /// **'Dialogue changed. Save and review the voiceover request again.'**
  String get speechTextChanged;

  /// No description provided for @configureSpeech.
  ///
  /// In en, this message translates to:
  /// **'Configure your speech service URL, model, voice and API key.'**
  String get configureSpeech;

  /// No description provided for @speechSpeedInvalid.
  ///
  /// In en, this message translates to:
  /// **'Speech speed must be between 0.25 and 4.'**
  String get speechSpeedInvalid;

  /// No description provided for @speechTooLarge.
  ///
  /// In en, this message translates to:
  /// **'Generated audio exceeds the 32 MB limit.'**
  String get speechTooLarge;

  /// No description provided for @speechInvalidAudio.
  ///
  /// In en, this message translates to:
  /// **'Your provider did not return valid WAV audio.'**
  String get speechInvalidAudio;

  /// No description provided for @speechTimeout.
  ///
  /// In en, this message translates to:
  /// **'Voiceover timed out. Check your provider history before submitting again.'**
  String get speechTimeout;

  /// No description provided for @speechFailed.
  ///
  /// In en, this message translates to:
  /// **'Voiceover did not complete. Check your settings and provider history before retrying.'**
  String get speechFailed;

  /// No description provided for @speechCancelled.
  ///
  /// In en, this message translates to:
  /// **'Local voiceover tracking stopped. The provider may continue processing.'**
  String get speechCancelled;

  /// No description provided for @speechPlay.
  ///
  /// In en, this message translates to:
  /// **'Play voiceover'**
  String get speechPlay;

  /// No description provided for @speechPause.
  ///
  /// In en, this message translates to:
  /// **'Pause voiceover'**
  String get speechPause;

  /// No description provided for @speechReplay.
  ///
  /// In en, this message translates to:
  /// **'Replay voiceover'**
  String get speechReplay;

  /// No description provided for @speechTrackDuration.
  ///
  /// In en, this message translates to:
  /// **'Track duration'**
  String get speechTrackDuration;

  /// No description provided for @speechLongTrack.
  ///
  /// In en, this message translates to:
  /// **'Voiceover is longer than the shot and will be cut off. Shorten the dialogue, change the speed or extend the shot, then listen again.'**
  String get speechLongTrack;

  /// No description provided for @speechPlaybackError.
  ///
  /// In en, this message translates to:
  /// **'Audio could not play. Check the file or choose another track and retry.'**
  String get speechPlaybackError;

  /// No description provided for @speechSeek.
  ///
  /// In en, this message translates to:
  /// **'Voiceover playback position'**
  String get speechSeek;

  /// No description provided for @speechRetryNotice.
  ///
  /// In en, this message translates to:
  /// **'Recreating uses the currently saved dialogue and speech settings and may incur another charge.'**
  String get speechRetryNotice;

  /// No description provided for @speechNewRequest.
  ///
  /// In en, this message translates to:
  /// **'Review a new voiceover request'**
  String get speechNewRequest;

  /// No description provided for @speechHttpError.
  ///
  /// In en, this message translates to:
  /// **'Speech service returned HTTP {status}. Check your account and model access.'**
  String speechHttpError(String status);

  /// No description provided for @captionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Timed captions'**
  String get captionsTitle;

  /// No description provided for @captionsIntro.
  ///
  /// In en, this message translates to:
  /// **'Edit times relative to this shot. Import desktop transcription or adjust cues manually. Script dialogue is kept.'**
  String get captionsIntro;

  /// No description provided for @captionStart.
  ///
  /// In en, this message translates to:
  /// **'Start / seconds'**
  String get captionStart;

  /// No description provided for @captionEnd.
  ///
  /// In en, this message translates to:
  /// **'End / seconds'**
  String get captionEnd;

  /// No description provided for @captionText.
  ///
  /// In en, this message translates to:
  /// **'Caption text'**
  String get captionText;

  /// No description provided for @captionAdd.
  ///
  /// In en, this message translates to:
  /// **'Add cue'**
  String get captionAdd;

  /// No description provided for @captionApply.
  ///
  /// In en, this message translates to:
  /// **'Apply timed captions'**
  String get captionApply;

  /// No description provided for @captionFallback.
  ///
  /// In en, this message translates to:
  /// **'Use script captions'**
  String get captionFallback;

  /// No description provided for @captionFromDialogue.
  ///
  /// In en, this message translates to:
  /// **'Start from script dialogue'**
  String get captionFromDialogue;

  /// No description provided for @captionEmpty.
  ///
  /// In en, this message translates to:
  /// **'This track is empty. Applying it hides captions for this shot.'**
  String get captionEmpty;

  /// No description provided for @invalidCaptions.
  ///
  /// In en, this message translates to:
  /// **'Cue times must be ordered, non-overlapping and within the shot duration. Each cue needs text.'**
  String get invalidCaptions;

  /// No description provided for @captionStale.
  ///
  /// In en, this message translates to:
  /// **'The audio or edit changed. Realign captions or switch to script captions before exporting.'**
  String get captionStale;

  /// No description provided for @captionSavedRefresh.
  ///
  /// In en, this message translates to:
  /// **'Captions saved, but refresh failed. Retry only refreshes the project.'**
  String get captionSavedRefresh;

  /// No description provided for @captionRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh saved captions'**
  String get captionRefresh;

  /// No description provided for @captionNoMedia.
  ///
  /// In en, this message translates to:
  /// **'Select a shot asset before creating timed captions.'**
  String get captionNoMedia;

  /// No description provided for @captionCurrentSource.
  ///
  /// In en, this message translates to:
  /// **'Current shot source'**
  String get captionCurrentSource;

  /// No description provided for @captionRemove.
  ///
  /// In en, this message translates to:
  /// **'Delete cue'**
  String get captionRemove;

  /// No description provided for @shotGeneration.
  ///
  /// In en, this message translates to:
  /// **'Generate shot media'**
  String get shotGeneration;

  /// No description provided for @generateImage.
  ///
  /// In en, this message translates to:
  /// **'Generate image'**
  String get generateImage;

  /// No description provided for @animateImage.
  ///
  /// In en, this message translates to:
  /// **'Animate selected image'**
  String get animateImage;

  /// No description provided for @imageProvider.
  ///
  /// In en, this message translates to:
  /// **'Image generation'**
  String get imageProvider;

  /// No description provided for @firstFrameTask.
  ///
  /// In en, this message translates to:
  /// **'First-frame video'**
  String get firstFrameTask;

  /// No description provided for @imageReview.
  ///
  /// In en, this message translates to:
  /// **'Review image generation'**
  String get imageReview;

  /// No description provided for @firstFrameReview.
  ///
  /// In en, this message translates to:
  /// **'Review first-frame video'**
  String get firstFrameReview;

  /// No description provided for @generationSendNotice.
  ///
  /// In en, this message translates to:
  /// **'Review what will be sent to your provider. Generation may incur charges.'**
  String get generationSendNotice;

  /// No description provided for @generationImages.
  ///
  /// In en, this message translates to:
  /// **'Images to send'**
  String get generationImages;

  /// No description provided for @generationNoReferences.
  ///
  /// In en, this message translates to:
  /// **'No reference images'**
  String get generationNoReferences;

  /// No description provided for @generationPrompt.
  ///
  /// In en, this message translates to:
  /// **'Prompt to send'**
  String get generationPrompt;

  /// No description provided for @generationConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm and queue'**
  String get generationConfirm;

  /// No description provided for @generationRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get generationRefresh;

  /// No description provided for @backToShot.
  ///
  /// In en, this message translates to:
  /// **'Back to shot'**
  String get backToShot;

  /// No description provided for @configureImage.
  ///
  /// In en, this message translates to:
  /// **'Set the Seedream base URL, model ID and API key in Settings.'**
  String get configureImage;

  /// No description provided for @configureFirstFrame.
  ///
  /// In en, this message translates to:
  /// **'Configure a Seedance video provider to animate the selected image.'**
  String get configureFirstFrame;

  /// No description provided for @seedreamSettingsHelp.
  ///
  /// In en, this message translates to:
  /// **'Use an enabled Seedream model for shot and cast references.'**
  String get seedreamSettingsHelp;

  /// No description provided for @imageBaseUrl.
  ///
  /// In en, this message translates to:
  /// **'Base URL without /images/generations'**
  String get imageBaseUrl;

  /// No description provided for @clearImageKey.
  ///
  /// In en, this message translates to:
  /// **'Clear saved image API key'**
  String get clearImageKey;

  /// No description provided for @firstFrameAspect.
  ///
  /// In en, this message translates to:
  /// **'Aspect ratio follows the image'**
  String get firstFrameAspect;

  /// No description provided for @generationChanged.
  ///
  /// In en, this message translates to:
  /// **'The project or provider changed. Refresh and review again.'**
  String get generationChanged;

  /// No description provided for @imagePromptRequired.
  ///
  /// In en, this message translates to:
  /// **'Save a shot prompt first.'**
  String get imagePromptRequired;

  /// No description provided for @imageReferenceLimit.
  ///
  /// In en, this message translates to:
  /// **'Image generation supports up to 10 reference images.'**
  String get imageReferenceLimit;

  /// No description provided for @imageReferenceInvalid.
  ///
  /// In en, this message translates to:
  /// **'Reference must be a project PNG, JPEG or WebP image.'**
  String get imageReferenceInvalid;

  /// No description provided for @imageReferencesTooLarge.
  ///
  /// In en, this message translates to:
  /// **'Reference images exceed the upload limit.'**
  String get imageReferencesTooLarge;

  /// No description provided for @imageInvalid.
  ///
  /// In en, this message translates to:
  /// **'The service returned an unreadable image.'**
  String get imageInvalid;

  /// No description provided for @imageResponseTooLarge.
  ///
  /// In en, this message translates to:
  /// **'The image response is larger than 28 MB.'**
  String get imageResponseTooLarge;

  /// No description provided for @generationSubmitting.
  ///
  /// In en, this message translates to:
  /// **'Submitting to the provider. Please avoid a duplicate request.'**
  String get generationSubmitting;

  /// No description provided for @generationPolling.
  ///
  /// In en, this message translates to:
  /// **'Remote task accepted. Waiting for video.'**
  String get generationPolling;

  /// No description provided for @generationCandidateSaved.
  ///
  /// In en, this message translates to:
  /// **'Candidate saved. Review it in the shot’s versions.'**
  String get generationCandidateSaved;

  /// No description provided for @generationReviewAgain.
  ///
  /// In en, this message translates to:
  /// **'Check your provider’s history before submitting again from the shot.'**
  String get generationReviewAgain;

  /// No description provided for @remoteGenerationId.
  ///
  /// In en, this message translates to:
  /// **'Provider task ID'**
  String get remoteGenerationId;

  /// No description provided for @generationHttpError.
  ///
  /// In en, this message translates to:
  /// **'Provider returned HTTP {status}. Check your account and model access.'**
  String generationHttpError(String status);

  /// No description provided for @generationVideoInvalid.
  ///
  /// In en, this message translates to:
  /// **'The provider did not return a readable MP4.'**
  String get generationVideoInvalid;

  /// No description provided for @generationRemoteFailed.
  ///
  /// In en, this message translates to:
  /// **'The provider reports that this task failed.'**
  String get generationRemoteFailed;

  /// No description provided for @generationTimedOut.
  ///
  /// In en, this message translates to:
  /// **'Video generation timed out. Check the provider’s task history.'**
  String get generationTimedOut;

  /// No description provided for @generationDownloadFailed.
  ///
  /// In en, this message translates to:
  /// **'The provider’s video download failed.'**
  String get generationDownloadFailed;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'zh'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
