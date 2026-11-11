import type { CorsProxyRoute } from './cors-proxy/cors-proxy-catalog';

/** Inert metadata shared by service settings, diagnostics and request metrics. */
export interface PublishingEndpoint {
  id: string;
  service: string;
  label: string;
  category: 'paste' | 'shortener';
  probeUrl: string;
  openUrl: string;
  proxyRoute?: CorsProxyRoute;
  status?: { url: string; labelKey: string; official: boolean };
}

/** All probes are read-only. Never probe a GET endpoint that creates a link. */
export const PUBLISHING_ENDPOINTS: readonly PublishingEndpoint[] = [
  {
    id: 'rentry',
    service: 'rentry',
    label: 'Rentry',
    category: 'paste',
    probeUrl: 'https://rentry.co/api/raw/mawkingbird-connectivity-check',
    openUrl: 'https://rentry.co',
    proxyRoute: 'paste',
  },
  {
    id: 'gist',
    service: 'gist',
    label: 'GitHub Gist',
    category: 'paste',
    probeUrl: 'https://api.github.com/gists/public?per_page=1',
    openUrl: 'https://gist.github.com',
  },
  {
    id: 'tinyurl',
    service: 'tinyurl',
    label: 'TinyURL (anonymous)',
    category: 'shortener',
    probeUrl: 'https://tinyurl.com/preview/1',
    openUrl: 'https://tinyurl.com',
  },
  {
    id: 'tinyurl-api',
    service: 'tinyurl',
    label: 'TinyURL (account API)',
    category: 'shortener',
    probeUrl: 'https://api.tinyurl.com/user',
    openUrl: 'https://tinyurl.com',
  },
  {
    id: 'dub',
    service: 'dub',
    label: 'Dub',
    category: 'shortener',
    probeUrl: 'https://api.dub.co/links',
    openUrl: 'https://dub.co',
    proxyRoute: 'shortener',
    status: {
      url: 'https://status.dub.co/',
      labelKey: 'settings.connections.doctor.status.dubStatus',
      official: true,
    },
  },
  {
    id: 'shortio',
    service: 'shortio',
    label: 'Short.io',
    category: 'shortener',
    probeUrl: 'https://api.short.io/api/links',
    openUrl: 'https://short.io',
    proxyRoute: 'shortener',
    status: {
      url: 'https://shortiostatus.com/',
      labelKey: 'settings.connections.doctor.status.shortioStatus',
      official: true,
    },
  },
  {
    id: 'tly',
    service: 'tly',
    label: 'T.LY',
    category: 'shortener',
    probeUrl: 'https://api.t.ly/api/v1/link/list',
    openUrl: 'https://t.ly',
    proxyRoute: 'shortener',
    status: {
      url: 'https://statusgator.com/services/tly',
      labelKey: 'settings.connections.doctor.status.tlyStatus',
      official: false,
    },
  },
  {
    id: 'rebrandly',
    service: 'rebrandly',
    label: 'Rebrandly',
    category: 'shortener',
    probeUrl: 'https://api.rebrandly.com/v1/account',
    openUrl: 'https://rebrandly.com',
    proxyRoute: 'shortener',
  },
  {
    id: 'isgd',
    service: 'isgd',
    label: 'is.gd',
    category: 'shortener',
    probeUrl: 'https://is.gd/forward.php?format=json&shorturl=is.gd',
    openUrl: 'https://is.gd',
  },
];

export const PASTE_SERVICES = [
  { id: 'rentry', endpointIds: ['rentry'], setup: null },
  { id: 'tinyurl', endpointIds: ['tinyurl'], setup: null },
  { id: 'shortener', endpointIds: [], setup: '/settings/connections/link-shortener' },
  { id: 'gist', endpointIds: ['gist'], setup: '/settings/connections/gist' },
] as const;
