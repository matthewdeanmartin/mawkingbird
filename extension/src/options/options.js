import { MAWKINGBIRD_BASES, normalizeBase } from '../lib/links.js';
import { getBase, setBase } from '../lib/settings.js';

const form = document.getElementById('form');
const custom = document.getElementById('custom');
const message = document.getElementById('message');

const current = await getBase();
const preset = Object.entries(MAWKINGBIRD_BASES).find(([, url]) => url === current)?.[0];
form.elements.base.value = preset ?? 'custom';
if (!preset) custom.value = current;

custom.addEventListener('focus', () => {
  form.elements.base.value = 'custom';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const choice = form.elements.base.value;
  const wanted = choice === 'custom' ? custom.value : MAWKINGBIRD_BASES[choice];
  if (!normalizeBase(wanted)) {
    message.textContent = 'Use an https:// address, or http://localhost for a local copy.';
    return;
  }
  const saved = await setBase(wanted);
  message.textContent = `Saved. Opening ${saved}`;
});
