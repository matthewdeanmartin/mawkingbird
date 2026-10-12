import assert from 'node:assert/strict';
import { search } from './youtube.mjs';

for (const type of ['video', 'channel']) {
  const result = await search('Technology Connections', type);
  assert.ok(result.items.length > 0, `No ${type} results returned`);
  const owner = type === 'video' ? result.items[0].channel : result.items[0];
  assert.match(owner.id, /^UC[\w-]{22}$/);
  assert.ok(owner.rssUrl);
  console.log(JSON.stringify({ type, count: result.items.length, first: result.items[0] }, null, 2));
}
