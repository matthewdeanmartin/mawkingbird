export function updateTranslationJson(raw, key, value, mode) {
  const [namespace, ...parts] = key.split(".");
  const leaf = parts.join(".");
  if (!namespace || !leaf) throw new Error("Invalid i18n key.");
  const data = JSON.parse(raw);
  if (JSON.stringify(data, null, 2) + "\n" !== raw)
    throw new Error(
      "Locale JSON has unexpected formatting; refusing to rewrite it.",
    );
  if (mode === "english") {
    if (!Object.hasOwn(data[namespace] || {}, leaf))
      throw new Error(`English key ${key} is missing.`);
    data[namespace][leaf] = value;
  } else if (mode === "invalidate") {
    if (!Object.hasOwn(data[namespace] || {}, leaf))
      return { text: raw, removed: false };
    delete data[namespace][leaf];
  } else {
    throw new Error("Unknown translation update mode.");
  }
  return {
    text: JSON.stringify(data, null, 2) + "\n",
    removed: mode === "invalidate",
  };
}
