import { classifyStorageKey, Sensitivity, STORAGE_KEYS, StorageKeySpec } from './storage-registry';

export const PORTABLE_CONFIG_KIND = 'mockingbird-client-config';
export const PORTABLE_CONFIG_VERSION = 1;
export const MINIMUM_SUPPORTED_CONFIG_VERSION = 1;

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_VALUE_BYTES = 256 * 1024;
const PRIVATE_CONFIG_KEYS = new Set([
  'mastodon_mock_server',
  'mockingbird_cors_proxy',
  'mockingbird_shortener',
]);
const NON_PREFERENCE_KEYS = new Set([
  'mastodon_mock_account_mode',
  'mockingbird_follow_nudge_dismissed',
  'mockingbird_search_server_rejects_v1',
]);
const SUSPICIOUS_FIELD =
  /(?:^|_)(?:access_?token|refresh_?token|api_?key|edit_?key|password|secret|authorization|credentials?)(?:$|_)/i;

export type PortableConfigPrivacy = 'standard' | 'private';

export interface PortableConfig {
  kind: typeof PORTABLE_CONFIG_KIND;
  schemaVersion: number;
  minimumReaderVersion: number;
  exportedAt: string;
  privacy: PortableConfigPrivacy;
  values: Record<string, string>;
}

export interface ConfigChange {
  key: string;
  action: 'add' | 'change' | 'remove';
}

function isPortableSpec(spec: StorageKeySpec, privacy: PortableConfigPrivacy): boolean {
  if (spec.storage !== 'local' || spec.suffix !== 'none' || NON_PREFERENCE_KEYS.has(spec.base)) {
    return false;
  }
  if (spec.sensitivity === 'setting') {
    return true;
  }
  return privacy === 'private' && PRIVATE_CONFIG_KEYS.has(spec.base);
}

export function portableKeys(privacy: PortableConfigPrivacy): string[] {
  return STORAGE_KEYS.filter((spec) => isPortableSpec(spec, privacy)).map((spec) => spec.base);
}

/** Build a global-only client configuration and audit the finished payload before returning it. */
export function exportPortableConfig(
  storage: Storage,
  includePrivate: boolean,
  now = new Date(),
): PortableConfig {
  const privacy: PortableConfigPrivacy = includePrivate ? 'private' : 'standard';
  const values: Record<string, string> = {};
  for (const key of portableKeys(privacy)) {
    const value = storage.getItem(key);
    if (value !== null) {
      values[key] = value;
    }
  }
  const config: PortableConfig = {
    kind: PORTABLE_CONFIG_KIND,
    schemaVersion: PORTABLE_CONFIG_VERSION,
    minimumReaderVersion: MINIMUM_SUPPORTED_CONFIG_VERSION,
    exportedAt: now.toISOString(),
    privacy,
    values,
  };
  assertSafeConfig(config, storage);
  return config;
}

/**
 * Runtime leak test. The registry is the primary boundary; this second pass catches both a
 * misclassified key and a secret accidentally embedded inside an otherwise exportable object.
 */
export function assertSafeConfig(config: PortableConfig, storage?: Storage): void {
  for (const [key, raw] of Object.entries(config.values)) {
    const spec = classifyStorageKey(key);
    if (spec === null || !isPortableSpec(spec, config.privacy)) {
      throw new Error(`Configuration export refused unsafe key "${key}".`);
    }
    if ((['secret', 'cache', 'content'] as Sensitivity[]).includes(spec.sensitivity)) {
      throw new Error(`Configuration export refused ${spec.sensitivity} key "${key}".`);
    }
    if (new Blob([raw]).size > MAX_VALUE_BYTES) {
      throw new Error(`Configuration value "${key}" is too large to export.`);
    }
    auditObjectFields(raw, key);
  }

  const serialized = JSON.stringify(config);
  if (new Blob([serialized]).size > MAX_CONFIG_BYTES) {
    throw new Error('Configuration is too large to export safely.');
  }
  if (storage) {
    for (const secret of storedSecretStrings(storage)) {
      if (secret.length >= 8 && serialized.includes(secret)) {
        throw new Error('Configuration export stopped because a stored credential appeared in it.');
      }
    }
  }
}

function auditObjectFields(raw: string, storageKey: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return;
  }
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value !== null && typeof value === 'object') {
      for (const [field, child] of Object.entries(value)) {
        if (SUSPICIOUS_FIELD.test(field)) {
          throw new Error(
            `Configuration export stopped: "${storageKey}" contains credential-like field "${field}".`,
          );
        }
        visit(child);
      }
    }
  };
  visit(parsed);
}

function storedSecretStrings(storage: Storage): string[] {
  const strings: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || classifyStorageKey(key)?.sensitivity !== 'secret') {
      continue;
    }
    const raw = storage.getItem(key);
    if (raw === null) {
      continue;
    }
    strings.push(raw);
    try {
      collectStrings(JSON.parse(raw) as unknown, strings);
    } catch {
      // A credential may itself be a plain string rather than JSON.
    }
  }
  return strings;
}

function collectStrings(value: unknown, target: string[]): void {
  if (typeof value === 'string') {
    target.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, target));
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, target));
  }
}

export function parsePortableConfig(text: string): PortableConfig {
  if (new Blob([text]).size > MAX_CONFIG_BYTES) {
    throw new Error('Configuration file is larger than the 1 MB safety limit.');
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error('This is not valid JSON.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('This is not a Mockingbird configuration file.');
  }
  const candidate = value as Partial<PortableConfig>;
  if (candidate.kind !== PORTABLE_CONFIG_KIND) {
    throw new Error('This is not a Mockingbird configuration file.');
  }
  if (
    !Number.isInteger(candidate.schemaVersion) ||
    !Number.isInteger(candidate.minimumReaderVersion)
  ) {
    throw new Error('Configuration version information is missing or invalid.');
  }
  if ((candidate.schemaVersion ?? 0) < MINIMUM_SUPPORTED_CONFIG_VERSION) {
    throw new Error(`Configuration version ${candidate.schemaVersion} is no longer supported.`);
  }
  if ((candidate.minimumReaderVersion ?? 0) > PORTABLE_CONFIG_VERSION) {
    throw new Error('This configuration requires a newer version of Mockingbird.');
  }
  if (candidate.schemaVersion !== PORTABLE_CONFIG_VERSION) {
    throw new Error(
      `Configuration version ${candidate.schemaVersion} is not supported by this build.`,
    );
  }
  if (candidate.privacy !== 'standard' && candidate.privacy !== 'private') {
    throw new Error('Configuration privacy profile is invalid.');
  }
  if (
    candidate.values === null ||
    typeof candidate.values !== 'object' ||
    Array.isArray(candidate.values)
  ) {
    throw new Error('Configuration values are missing or invalid.');
  }
  for (const [key, raw] of Object.entries(candidate.values)) {
    if (typeof raw !== 'string') {
      throw new Error(`Configuration value "${key}" must be a string.`);
    }
  }
  const config = candidate as PortableConfig;
  assertSafeConfig(config);
  return config;
}

export function configChanges(config: PortableConfig, storage: Storage): ConfigChange[] {
  const incoming = config.values;
  return portableKeys(config.privacy).flatMap((key): ConfigChange[] => {
    const before = storage.getItem(key);
    const after = incoming[key] ?? null;
    if (before === after) {
      return [];
    }
    return [{ key, action: before === null ? 'add' : after === null ? 'remove' : 'change' }];
  });
}

/** Replace every global setting covered by the file's privacy profile. */
export function importPortableConfig(config: PortableConfig, storage: Storage): ConfigChange[] {
  const changes = configChanges(config, storage);
  for (const key of portableKeys(config.privacy)) {
    const value = config.values[key];
    if (value === undefined) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  }
  return changes;
}
