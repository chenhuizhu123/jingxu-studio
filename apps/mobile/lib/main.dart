import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'data/api.dart';
import 'data/studio.dart';
import 'l10n/generated/app_localizations.dart';
import 'screens/home.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks([
      'Noto Sans SC',
    ], await rootBundle.loadString('assets/OFL.txt'));
  });
  final studio = Studio(StudioApi());
  runApp(JingxuApp(studio: studio));
  studio.initialize();
}

class JingxuApp extends StatelessWidget {
  final Studio studio;
  const JingxuApp({super.key, required this.studio});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: studio,
    builder: (context, _) => StudioScope(
      studio: studio,
      child: MaterialApp(
        title: 'Jingxu Studio',
        debugShowCheckedModeBanner: false,
        locale: studio.locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: ThemeData(
          useMaterial3: true,
          fontFamily: 'NotoSansSC',
          scaffoldBackgroundColor: const Color(0xfff6f6f0),
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xff285744),
            primary: const Color(0xff285744),
            surface: Colors.white,
          ),
          appBarTheme: const AppBarTheme(
            backgroundColor: Color(0xfff6f6f0),
            surfaceTintColor: Colors.transparent,
            centerTitle: false,
            elevation: 0,
          ),
          textTheme: const TextTheme(
            headlineLarge: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w600,
              letterSpacing: -1,
              color: Color(0xff1c3229),
            ),
            headlineMedium: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w600,
              letterSpacing: -.8,
              color: Color(0xff1c3229),
            ),
            titleLarge: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w600,
              color: Color(0xff1c3229),
            ),
            titleMedium: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Color(0xff1c3229),
            ),
            bodyMedium: TextStyle(
              fontSize: 13,
              height: 1.65,
              color: Color(0xff69746a),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: const Color(0xfff7f8f4),
            alignLabelWithHint: true,
            contentPadding: const EdgeInsets.all(16),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xffdfe4da)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xffdfe4da)),
            ),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
              minimumSize: const Size(44, 48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          navigationBarTheme: const NavigationBarThemeData(
            backgroundColor: Colors.white,
            indicatorColor: Color(0xffe3ecdf),
            height: 72,
          ),
          floatingActionButtonTheme: const FloatingActionButtonThemeData(
            backgroundColor: Color(0xff285744),
            foregroundColor: Colors.white,
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(14)),
            ),
          ),
          dividerTheme: const DividerThemeData(color: Color(0xffe5e7de)),
          snackBarTheme: const SnackBarThemeData(
            behavior: SnackBarBehavior.floating,
          ),
        ),
        home: const StudioHome(),
      ),
    ),
  );
}
