import 'package:flutter_test/flutter_test.dart';
import 'package:jingxu_mobile/data/domain.dart';
import 'package:jingxu_mobile/data/models.dart';

void main() {
  test('bilingual rule drafts preserve the language of creative text', () {
    final p = newProject({
      'name': 'Rain',
      'script': 'Cast: Maya, Sam\nMaya: Where were you?\nA door closes.',
    });
    expect(p['characters'].length, 2);
    expect(p['shots'].length, 2);
    expect(p['shots'][0]['dialogue'], 'Where were you?');
    expect(p['shots'][0]['characterIds'].length, 1);
  });
  test('new candidates do not overwrite the chosen version', () {
    final p = newProject({'name': 'A', 'script': 'Shot A'}), s = p['shots'][0];
    addCandidate(p, s['id'], {'id': 'a', 'kind': 'image'}, 'one', 'demo');
    final selected = s['selectedVersionId'];
    s['review'] = 'approved';
    addCandidate(p, s['id'], {'id': 'b', 'kind': 'image'}, 'two', 'demo');
    expect(s['selectedVersionId'], selected);
    expect(s['versions'].length, 2);
    expect(s['review'], 'pending');
  });
  test(
    'edits invalidate stale visual review and reject foreign references',
    () {
      final p = newProject({'name': 'A', 'script': 'Shot A'}),
          s = p['shots'][0];
      s['visualReview'] = {'text': 'old'};
      s['review'] = 'approved';
      patchShot(p, s['id'], {'trimStart': 2.0});
      expect(s.containsKey('visualReview'), false);
      expect(s['review'], 'pending');
      expect(
        () => patchShot(p, s['id'], {'duration': 31}),
        throwsArgumentError,
      );
      expect(
        () => patchShot(p, s['id'], {
          'referenceIds': ['foreign'],
        }),
        throwsArgumentError,
      );
      expect(
        () => patchShot(p, s['id'], {'versions': []}),
        throwsArgumentError,
      );
    },
  );
  test('reordering preserves candidates and recalculates subtitle timing', () {
    final p = newProject({'name': 'A', 'script': 'Maya: First\nSam: Second'});
    final a = p['shots'][0], b = p['shots'][1];
    a['duration'] = 3.0;
    b['duration'] = 4.0;
    addCandidate(p, a['id'], {'id': 'a', 'kind': 'image'}, 'one', 'demo');
    reorder(p, [b['id'], a['id']]);
    expect(p['shots'][1]['versions'].length, 1);
    expect(
      subtitles(Project.fromJson({...p, 'assets': []})),
      contains('00:00:00,000 --> 00:00:04,000\nSecond'),
    );
    expect(() => reorder(p, [a['id'], a['id']]), throwsArgumentError);
  });
  test('subtitle gaps and CSV injection protection', () {
    final p = newProject({'name': 'A', 'script': 'Silence\nMaya: Hello'});
    p['shots'][0]['duration'] = 3.5;
    expect(subtitles(Project.fromJson(p)), contains('00:00:03,500'));
    expect(csvCell('=cmd()'), '"\'=cmd()"');
    expect(csvCell('a"b'), '"a""b"');
  });
}
