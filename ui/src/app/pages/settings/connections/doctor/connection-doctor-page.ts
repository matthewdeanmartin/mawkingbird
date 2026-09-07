import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CorsProxy } from '../../../../providers/cors-proxy/cors-proxy';
import { Server } from '../../../../server';
import { ConnectionDoctor } from './connection-doctor';
import {
  categoryLabel,
  corsHint,
  homeServerTarget,
  interpret,
  outcomeLabel,
  probeTargets,
  ProbeCategory,
  ProbeTarget,
  ProbeVerdict,
  proxyHint,
  reportedOptions,
  ReportedOutcome,
  rowOutcome,
  RowOutcome,
  timingHint,
} from './connection-doctor-catalog';

// i18n settings.connections.doctor.back: ‹ All connections
// i18n settings.connections.doctor.title: 🩺 Connection doctor
// i18n settings.connections.doctor.intro.a: Some networks — offices, schools, hotels, some countries — block whole categories of site. This checks every service Mawkingbird can talk to and tells you which ones this network will let your browser reach, so you find out
// i18n settings.connections.doctor.intro.before: before
// i18n settings.connections.doctor.intro.b: making an account and paying for an API key, rather than after.
// i18n settings.connections.doctor.noCredentials: Nothing here needs a key or a login, and no credential you have already saved is used or sent. Every request is an unauthenticated public URL.
// i18n settings.connections.doctor.checking: Checking…
// i18n settings.connections.doctor.checkAgain: Check again
// i18n settings.connections.doctor.checkAll: Check all connections
// i18n settings.connections.doctor.summary.working: {{count}} working
// i18n settings.connections.doctor.summary.needsSetup: {{count}} need a proxy
// i18n settings.connections.doctor.summary.blocked: {{count}} blocked or unreachable
// i18n settings.connections.doctor.controlFailed: The control host failed too, and nobody blocks that one on purpose. Your browser is probably offline, or something is blocking everything — treat the rest of this page as untrustworthy until that row is green.
// i18n settings.connections.doctor.thirdParty: third-party
// i18n settings.connections.doctor.followup.explain: Your browser could not fetch this in the background — but that alone cannot tell a network block from a CORS rule or an ad blocker. Opening it in a tab can, because a normal page load shows you the real reason.
// i18n settings.connections.doctor.followup.openLabel: Open
// i18n settings.connections.doctor.followup.openSuffix: in a tab ↗
// i18n settings.connections.doctor.followup.statusIntro: If it reports everything operational, the problem is more likely on your side than theirs — worth ruling out an outage first:
// i18n settings.connections.doctor.followup.noStatus: This service publishes no status page, so there is no way to check whether it is having an outage — the tab test above is the only signal available.
// i18n settings.connections.doctor.report.legend: What did that tab show you?
// i18n settings.connections.doctor.corsSection.title: About "just disable CORS"
// i18n settings.connections.doctor.corsSection.intro: These hosts answer your browser but will not let this app read the reply:
// i18n settings.connections.doctor.corsSection.badTrade: It is tempting to reach for a browser extension that turns CORS off, and you will find people recommending exactly that. It is a bad trade: those extensions cannot be scoped to a couple of domains in any meaningful way, so you would be disabling a protection that applies to your bank and your webmail in order to read a timeline — and the moment you forget it is on, every site you visit is running with it.
// i18n settings.connections.doctor.corsSection.whitelist.a: There is also nothing to whitelist. Refusing is the
// i18n settings.connections.doctor.corsSection.hosts: host's
// i18n settings.connections.doctor.corsSection.whitelist.b: decision, made on their server; nothing installed on this side changes their mind. That is exactly what a
// i18n settings.connections.doctor.corsProxyLink: CORS proxy
// i18n settings.connections.doctor.corsSection.whitelist.c: is for — it fetches on your behalf from somewhere the rule does not apply, and it is scoped to this app instead of to your whole browser.
// i18n settings.connections.doctor.corsSection.noProxy.a: You do not have one configured, which is why these are listed as unusable rather than merely indirect.
// i18n settings.connections.doctor.setOneUp: Set one up
// i18n settings.connections.doctor.corsSection.noProxy.b: and they can work.
// i18n settings.connections.doctor.proxyRefused.title: Hosts your proxy can't rescue
// i18n settings.connections.doctor.proxyRefused.intro: {{proxy}} is working — it answered when asked. These services refused it anyway:
// i18n settings.connections.doctor.proxyRefused.fix.a: Proxies run in datacentres, and a lot of services block those address ranges while happily answering home connections. Retrying will not help and the proxy is not misconfigured; the fix is a
// i18n settings.connections.doctor.differentProxyLink: different proxy
// i18n settings.connections.doctor.proxyRefused.fix.b: — ideally one you run yourself, on an address nobody has blocklisted.
// i18n settings.connections.doctor.explain.title: What this can and cannot tell you
// i18n settings.connections.doctor.explain.p1: A background request that fails reports nothing at all to JavaScript — not a status, not a reason. That is the browser's own privacy rule, not a gap in this page: a site is not allowed to learn what else your network can reach. So a red row means only "this did not answer", and the cause could be a firewall, DNS filtering, an extension, a bot check, or a service having a bad day.
// i18n settings.connections.doctor.explain.p2: Opening the host in a tab is the missing half. A top-level page load isn't subject to those rules, so the browser will show you the block page, the certificate warning or the DNS error directly. Those pages are privileged and unreadable from script, which is why the page has to ask you what you saw rather than detecting it.
// i18n settings.connections.doctor.explain.p3: It also catches the case that isn't an error at all: if a service greets you with "verify you are human", your network is fine and the service simply doesn't want traffic it can't identify. Worth knowing, because clearing that challenge in a tab does not make the connector start working.
// i18n settings.connections.doctor.explain.p4a: Each row is checked twice, which is why "reachable" and "readable" are reported separately. The first request only asks whether the bytes arrive; the second asks whether this app is allowed to look at them. A red row failed the
// i18n settings.connections.doctor.first: first
// i18n settings.connections.doctor.explain.p4b: question, so CORS was never involved and no browser extension can rescue it — the traffic isn't getting through at all. How long a row took is shown for the same reason: a refusal comes back in milliseconds, while traffic being silently discarded takes seconds to give up.
// i18n settings.connections.doctor.explain.p5a: There is a third question this page cannot answer at all: whether the service is simply having a bad day. A failed probe proves the bytes didn't arrive
// i18n settings.connections.doctor.here: here
// i18n settings.connections.doctor.explain.p5b: , not whose fault that is — so each row links to the vendor's own status page where one exists. Read those as the authority on their own incidents, and anything marked third-party as a hint rather than a verdict: outage aggregators covering small services are often stale, and were observed calling is.gd down while it was demonstrably serving requests. That is why a few rows link nowhere.
// i18n settings.connections.doctor.explain.p6: Anything that is reachable but unreadable gets a third check through your CORS proxy, if you have one. That is the one that tells you whether a service is actually usable — and if the proxy fetches it fine while the connector still fails, the problem is past the network entirely and worth looking for in your API key, your credit balance or a consent you haven't given.

/** A target joined to its verdict and whatever the user reported about it. */
export interface DoctorRow {
  target: ProbeTarget;
  verdict: ProbeVerdict;
  /**
   * The one signal that decides the row's colour: can this be used?
   *
   * Kept separate from {@link verdict}, which only ever meant "did bytes
   * arrive". A host reached through a working proxy is green here and
   * `reachable` there, and that difference is the point.
   */
  outcome: RowOutcome;
  /** Headline text for the outcome, e.g. "Working (via proxy)". */
  outcomeLabel: string;
  /** How long the probe took, already formatted. Null before a run. */
  timing: string | null;
  /** What that duration suggests, when it suggests anything. */
  timingHint: string | null;
  /** Whether this app may read the host's replies, once it is reachable. */
  corsHint: string | null;
  /** True when the host answers but refuses to be read — the proxy case. */
  corsBlocked: boolean;
  /** How the configured proxy fared against this host, in words. */
  proxyHint: string | null;
  /** True when the proxy got through, so remaining faults are past the network. */
  proxyWorks: boolean;
  /** True when the proxy is healthy but this host turned it away. */
  proxyRefused: boolean;
  reported: ReportedOutcome | null;
  /** The combined reading, once both halves are in. */
  interpretation: string | null;
}

interface DoctorGroup {
  category: ProbeCategory;
  label: string;
  rows: DoctorRow[];
}

/**
 * Connection doctor: one sweep that says which hosts this network will let the
 * browser reach, before you invest in setting any of them up.
 *
 * The failure it exists to prevent is expensive and entirely silent: register
 * for a service, generate a key, sometimes buy credits, paste it in, watch it
 * fail with a network error that could mean anything, and have no way to tell
 * "the key is wrong" from "this network drops that host". Then do it again for
 * the next connector.
 *
 * Deliberately reachable without connecting anything, and it never reads a
 * stored credential — see the note in `connection-doctor-catalog.ts`.
 */
@Component({
  selector: 'app-connection-doctor-page',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './connection-doctor-page.html',
  styleUrls: ['../connection-page.css', './connection-doctor-page.css'],
})
export class ConnectionDoctorPage {
  protected doctor = inject(ConnectionDoctor);
  private server = inject(Server);
  private proxy = inject(CorsProxy);
  private transloco = inject(TranslocoService);

  /** Bound to `translate`'s shape so the catalog's free functions stay DI-free. */
  private readonly translate = (key: string, params?: Record<string, unknown>) =>
    this.transloco.translate(key, params);

  protected readonly reportedOptions = reportedOptions(this.translate);

  /** What the user says they saw, per target id. */
  private reports = signal<Readonly<Record<string, ReportedOutcome>>>({});
  /** Which rows have the "what did you see?" panel open. */
  private expanded = signal<ReadonlySet<string>>(new Set());

  /**
   * The home server first, then the fixed catalog. Computed rather than
   * constant because the Mastodon instance is whatever the user picked, and the
   * built-in mock contributes no row at all.
   */
  protected readonly targets = computed<ProbeTarget[]>(() => {
    const home = homeServerTarget(this.server.baseUrl(), this.translate);
    const rest = probeTargets(this.translate);
    return home ? [home, ...rest] : [...rest];
  });

  protected readonly groups = computed<DoctorGroup[]>(() => {
    const results = this.doctor.results();
    const reports = this.reports();
    const proxyLabel = this.proxy.label();
    const groups = new Map<ProbeCategory, DoctorGroup>();

    for (const target of this.targets()) {
      const result = results[target.id] ?? {
        verdict: 'idle' as ProbeVerdict,
        cors: 'unknown' as const,
        proxy: 'unknown' as const,
        ms: null,
        proxyMs: null,
      };
      const verdict = result.verdict;
      const reported = reports[target.id] ?? null;
      const outcome = rowOutcome(result);
      const row: DoctorRow = {
        target,
        verdict,
        outcome,
        outcomeLabel: outcomeLabel(outcome, result, this.translate),
        timing: result.ms !== null && verdict !== 'checking' ? formatDuration(result.ms) : null,
        timingHint: timingHint(result, this.translate),
        corsHint: corsHint(result, this.translate),
        corsBlocked: verdict === 'reachable' && result.cors === 'blocked',
        proxyHint: proxyHint(result, proxyLabel, this.translate),
        proxyWorks: result.proxy === 'works',
        proxyRefused: result.proxy === 'target-refused',
        reported,
        // Only meaningful once the probe has actually run: pairing a report
        // with 'idle' would let the page state a cause it has not tested.
        interpretation:
          reported && (verdict === 'reachable' || verdict === 'failed' || verdict === 'timeout')
            ? interpret(verdict, reported, this.translate)
            : null,
      };
      const existing = groups.get(target.category);
      if (existing) {
        existing.rows.push(row);
      } else {
        groups.set(target.category, {
          category: target.category,
          label: categoryLabel(target.category, this.translate),
          rows: [row],
        });
      }
    }
    return [...groups.values()];
  });

  protected readonly hasRun = computed(() => this.doctor.lastRunAt() !== null);

  /**
   * Counted by outcome, not by reachability.
   *
   * The summary used to say "12 reachable, 3 blocked" while the rows said
   * things like "needs a proxy" — counting a different question than the one
   * the page answers. A host working through a proxy belongs in the good
   * number, because it works.
   */
  protected readonly workingCount = computed(
    () => this.allRows().filter((row) => row.outcome === 'usable').length,
  );

  protected readonly needsSetupCount = computed(
    () => this.allRows().filter((row) => row.outcome === 'needs-setup').length,
  );

  protected readonly blockedCount = computed(
    () => this.allRows().filter((row) => row.outcome === 'unusable').length,
  );

  /**
   * Hosts that answer but refuse to be read, *and* that nothing has rescued —
   * the population a CORS proxy exists for, and the one a "disable CORS"
   * extension would appear to fix while breaking a browser-wide protection.
   *
   * Rows already working through a proxy are excluded: listing a solved host
   * under "these will not work" is the same mixed signal this page had in its
   * colours, moved into prose.
   */
  protected readonly corsBlockedRows = computed(() =>
    // The control is excluded deliberately: it exists only to prove the test
    // works, so telling the reader it needs a proxy is advice about a host
    // they will never connect to.
    this.allRows().filter(
      (row) => row.corsBlocked && row.outcome !== 'usable' && row.target.category !== 'control',
    ),
  );

  /** Whether a proxy is configured at all, which changes what the advice says. */
  protected readonly hasProxy = computed(() => this.proxy.available());

  /** The configured proxy's name, for copy that refers to it. */
  protected readonly proxyLabel = computed(() => this.proxy.label());

  /**
   * Hosts the proxy could not rescue — it is alive, they turned it away. Worth
   * calling out separately because the remedy is a *different* proxy, not a
   * working one, and no amount of retrying this one will help.
   */
  protected readonly proxyRefusedRows = computed(() =>
    this.allRows().filter((row) => row.proxyRefused && row.target.category !== 'control'),
  );

  /**
   * True when the control host failed, which invalidates everything else on the
   * page: if `example.com` is unreachable then the browser is offline or the
   * whole network is down, and every other red row is that same fact repeated.
   */
  protected readonly controlFailed = computed(() => {
    const control = this.allRows().find((row) => row.target.category === 'control');
    return !!control && (control.verdict === 'failed' || control.verdict === 'timeout');
  });

  private allRows(): DoctorRow[] {
    return this.groups().flatMap((group) => group.rows);
  }

  protected run(): void {
    // Reports describe a previous sweep; keeping them would pair a fresh
    // verdict with a stale observation and state a conclusion for neither.
    this.reports.set({});
    this.expanded.set(new Set());
    void this.doctor.runAll(this.targets());
  }

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  /**
   * Open the host in a new tab and reveal the self-report panel.
   *
   * `noopener` matters beyond the usual hygiene here: without it the opened
   * page gets a handle on this one, and a diagnostic that hands a possibly
   * hostile intermediary a reference to the app is a poor trade for a tab.
   */
  protected openInTab(row: DoctorRow): void {
    window.open(row.target.openUrl, '_blank', 'noopener,noreferrer');
    this.expand(row.target.id);
  }

  protected expand(id: string): void {
    this.expanded.update((current) => new Set(current).add(id));
  }

  protected report(id: string, outcome: ReportedOutcome): void {
    this.reports.update((current) => ({ ...current, [id]: outcome }));
  }
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// Verdict copy now lives in the catalog's `outcomeLabel`, which words the
// headline in terms of usability rather than reachability. "Blocked or
// unreachable" survives there, still wordy on purpose: the browser genuinely
// cannot tell a firewall from a dead host, and a bare "Blocked" would be the
// page asserting something it did not observe.
