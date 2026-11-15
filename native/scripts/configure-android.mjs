// Keep the generated project on a published SDK available to local and CI builds.
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../src-tauri/gen/android/app/build.gradle.kts', import.meta.url);
let text = readFileSync(file, 'utf8');
for (const name of ['compileSdk', 'targetSdk']) {
  const pattern = new RegExp(String.raw`\b${name} = \d+`);
  if (!pattern.test(text)) throw new Error(`Generated Android project is missing ${name}`);
  text = text.replace(pattern, `${name} = 35`);
}
writeFileSync(file, text, 'utf8');
