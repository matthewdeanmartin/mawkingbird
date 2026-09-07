import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeholdersMatch } from './i18n-optional-terminology.mjs';

test('verified vocabulary may be localized without losing data or allowing extra arguments', () => {
  const key = 'accountAnalytics.barTitle';
  const source = '{{label}}: {{count}} {{posts}}, ~{{reach}} reach';
  assert(placeholdersMatch(key, source, '{{label}}: дописи: {{count}}, охоплення: ~{{reach}}'));
  assert(placeholdersMatch(key, source, source));
  assert(!placeholdersMatch(key, source, '{{label}}: дописи: {{count}}'));
  assert(!placeholdersMatch(key, source, '{{label}}: {{count}} {{reach}} {{name}}'));
  assert(!placeholdersMatch(key, source, '{{label}}: {{count}} {{reach}} {{posts}} {{posts}}'));
  assert(!placeholdersMatch('other.key', '{{posts}}', 'Дописи'));
  assert(!placeholdersMatch('compose.postTo', '{{noun}} {{name}}', 'Опублікувати'));
  assert(placeholdersMatch('compose.postTo', '{{noun}} to', 'Опублікувати в'));
});

test('non-vocabulary placeholder multiplicity stays strict', () => {
  assert(
    placeholdersMatch(
      'feedAnalytics.accounts.authors',
      '{{posts}} {{postsWord}}',
      'Дописи: {{posts}}',
    ),
  );
  assert(!placeholdersMatch('feedAnalytics.accounts.authors', '{{posts}} {{postsWord}}', 'Дописи'));
  assert(
    !placeholdersMatch('accountAnalytics.barTitle', '{{count}} {{count}} {{posts}}', '{{count}}'),
  );
  assert(placeholdersMatch('other.key', '{{name}} {{count}}', '{{count}} {{name}}'));
});

test('Korean vocabulary exceptions cannot remove action or count data', () => {
  assert(
    placeholdersMatch('shell.left.boostedByNetwork', '{{boosted}} by people', '사람들이 부스트함'),
  );
  assert(!placeholdersMatch('statusCard.countLabel', '{{count}} {{label}}', '{{count}}'));
  assert(!placeholdersMatch('statusCard.countLabel', '{{count}} {{label}}', '{{label}}'));
  assert(!placeholdersMatch('statusCard.actionFailure', "Couldn't {{verb}}", '실패했습니다'));
});
