import { search } from './youtube.mjs';

const [type = 'video', ...words] = process.argv.slice(2);
try {
  console.log(JSON.stringify(await search(words.join(' '), type), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
