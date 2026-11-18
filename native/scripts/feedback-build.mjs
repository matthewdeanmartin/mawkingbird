import { spawnSync } from 'node:child_process';

export function feedbackDefinition(source, env = process.env) {
  if (env.MAWKINGBIRD_FEEDBACK_TARGETS) {
    return 'FEEDBACK_TARGETS=' + JSON.stringify(JSON.parse(env.MAWKINGBIRD_FEEDBACK_TARGETS));
  }
  const officialRepo = 'matthewdeanmartin/mawkingbird';
  let official = env.GITHUB_REPOSITORY === officialRepo;
  if (!env.GITHUB_REPOSITORY) {
    const origin = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: source, encoding: 'utf8' }).stdout?.trim().replace(/\.git$/, '');
    official = origin === 'https://github.com/' + officialRepo || origin === 'git@github.com:' + officialRepo;
  }
  return 'OFFICIAL_NATIVE_FEEDBACK=' + official;
}
