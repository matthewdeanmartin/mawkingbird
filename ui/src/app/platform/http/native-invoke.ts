export function invokeSocial<T>(command: string, args: object): Promise<T> {
  const bridge = (
    window as unknown as {
      __TAURI__?: { core: { invoke<T>(command: string, args: object): Promise<T> } };
    }
  ).__TAURI__;
  if (!bridge) return Promise.reject(new Error('Native social transport is unavailable.'));
  return bridge.core.invoke<T>(command, args);
}
