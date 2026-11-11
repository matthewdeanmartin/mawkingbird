/** Move origins before creating origin-bound OAuth state. Loopback supports Web Crypto. */
export function redirectToSecureLogin(): boolean {
  const url = new URL(window.location.href);
  if (
    url.protocol !== 'http:' ||
    /^(localhost|.*\.localhost|127(?:\.\d+){3}|\[::1\])$/.test(url.hostname)
  )
    return false;
  url.protocol = 'https:';
  window.location.href = url.toString();
  return true;
}
