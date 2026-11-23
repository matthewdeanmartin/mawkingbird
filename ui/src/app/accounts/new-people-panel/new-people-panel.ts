import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbBadge } from '../../design-system/badge/badge';
import { MbButton } from '../../design-system/button/button';
import { MbHelp } from '../../design-system/help/help';
import { MbProgress } from '../../design-system/progress/progress';
import { HumanTimePipe } from '../../i18n/human-time.pipe';
import { Account } from '../../platform/api/models';
import { AccountName } from '../account-name';
import { accountProfilePath } from '../account-route';
import { FollowButton } from '../follow-button/follow-button';
import { Evidence, Reason, judge } from '../new-people';
import { CHECK_STEP, NewPeopleScan, PAGE } from '../new-people-scan';

// i18n newPeople.heading: New people to meet
// i18n newPeople.explain: Recent followers you don't follow back, with what can honestly be said about them.
// i18n newPeople.cost: Reads your {{count}} newest followers: about 5 requests. Their posts are read only if you ask.
// i18n newPeople.find: Find new people
// i18n newPeople.again: Start again
// i18n newPeople.loading: Reading followers…
// i18n newPeople.failed: Couldn't read your followers ({{error}}).
// i18n newPeople.none: You already follow everyone in the followers read so far.
// i18n newPeople.summary: {{count}} people you don't follow, from your {{read}} newest followers.
// i18n newPeople.more: Read older followers
// i18n newPeople.check: Check the posts of {{count}} people ({{count}} requests)
// i18n newPeople.checking: Reading their posts
// i18n newPeople.checkingCaption: {{checked}} of {{total}}
// i18n newPeople.stop: Stop
// i18n newPeople.tip: Run "When are your posts done?" in your analytics first to also see who replied to you before following.
// i18n newPeople.followed: Followed you {{time}}
// i18n newPeople.fromOrigin: Posts read from {{server}}
// i18n newPeople.unreadable: Their posts couldn't be read.
// i18n newPeople.askOrigin: Check their own server
// i18n newPeople.askingOrigin: Checking…
// i18n newPeople.originRefused: Their server didn't answer.
// i18n newPeople.dim.human: Human?
// i18n newPeople.dim.lively: Lively?
// i18n newPeople.dim.spam: Spam?
// i18n newPeople.human.vouched: Vouched for
// i18n newPeople.human.likely: Likely
// i18n newPeople.human.unclear: Not enough evidence
// i18n newPeople.human.automated: Says it's automated
// i18n newPeople.human.group: A group
// i18n newPeople.lively.talking: Talks with people
// i18n newPeople.lively.posting: Posting
// i18n newPeople.lively.quiet: Quiet
// i18n newPeople.lively.unknown: Not enough evidence
// i18n newPeople.spam.clear: Nothing found
// i18n newPeople.spam.caution: Worth a look
// i18n newPeople.spam.warning: Warning signs
// i18n newPeople.spam.unknown: Not enough evidence
// i18n newPeople.reason.saysAutomated: the account says it is automated
// i18n newPeople.reason.isGroup: a group account, not one person
// i18n newPeople.reason.vouched.one: {{names}}, whom you follow, follows them
// i18n newPeople.reason.vouched.other: {{count}} people you follow follow them, such as {{names}}
// i18n newPeople.reason.repliedBefore: replied to you before following
// i18n newPeople.reason.repliedToYou: has replied to you
// i18n newPeople.reason.talksWith.one: replies to {{count}} person
// i18n newPeople.reason.talksWith.other: replies to {{count}} different people
// i18n newPeople.reason.answered: got {{count}} replies
// i18n newPeople.reason.clockwork: {{pct}}% of posts run on a schedule
// i18n newPeople.reason.irregular: posts at irregular times
// i18n newPeople.reason.sleeps: has a daily quiet stretch
// i18n newPeople.reason.neverSleeps: posts around the clock
// i18n newPeople.reason.ownVsBoosts: {{own}}% own posts, {{boosts}}% boosts
// i18n newPeople.reason.verifiedSite: has a verified website
// i18n newPeople.reason.littleToGoOn: little to go on in the posts seen
// i18n newPeople.reason.postsNotChecked: posts not checked yet
// i18n newPeople.reason.asServerKnows: as far as your server knows
// i18n newPeople.reason.talkedRecently: talked with {{count}} people in 30 days
// i18n newPeople.reason.postedDays: last posted {{days}} days ago
// i18n newPeople.reason.noPosts: no posts
// i18n newPeople.reason.noneVisible: none of their posts are visible from your server
// i18n newPeople.reason.followRate: follows {{following}} accounts after {{days}} days
// i18n newPeople.reason.lopsided: follows {{following}}, followed by {{followers}}
// i18n newPeople.reason.repeats: {{pct}}% of posts repeat each other
// i18n newPeople.reason.sameLink: mostly links to {{host}}
// i18n newPeople.reason.namesPeople: often names people without replying ({{count}} people)
// i18n newPeople.reason.arrivedTogether: one of {{count}} new accounts from the same server, created within 3 days
// i18n newPeople.reason.nothingFound: {{count}} posts looked at
// i18n newPeople.reason.fewPosts: too few posts to tell
// i18n newPeople.help.about: About {{stat}}
// i18n newPeople.help.body: These are three separate answers, not a score. Most weight goes to what other people did: people you follow who follow them, and people who answer them. Behavior counts for less, because software can imitate it, so it never earns "Vouched for" alone. Bios, pictures and follower counts count for nothing. An "automated" label is believed, but its absence means nothing. Quiet is not a warning: plenty of people mostly read. Your server may hold few posts from people on other servers, and follow counts and join dates of remote accounts are what their server reports. Warning signs are reasons to look, not a verdict.

/** Recent followers you don't follow, with honest signals and their reasons. */
@Component({
  selector: 'app-new-people-panel',
  imports: [
    AccountName,
    FollowButton,
    HumanTimePipe,
    MbBadge,
    MbButton,
    MbHelp,
    MbProgress,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './new-people-panel.html',
  styleUrl: './new-people-panel.css',
})
export class NewPeoplePanel {
  /** The signed-in account's id. */
  readonly accountId = input.required<string>();

  protected readonly scan = inject(NewPeopleScan);
  protected readonly page = PAGE;

  protected readonly state = computed(() => {
    const s = this.scan.state();
    return s && s.accountId === this.accountId() ? s : null;
  });

  protected readonly rows = computed(() =>
    (this.state()?.people ?? []).map((e) => {
      const v = judge(e);
      return {
        e,
        dims: [
          { id: 'human', verdict: v.human.verdict, reasons: v.human.reasons, warn: false },
          { id: 'lively', verdict: v.lively.verdict, reasons: v.lively.reasons, warn: false },
          {
            id: 'spam',
            verdict: v.spam.verdict,
            reasons: v.spam.reasons,
            warn: v.spam.verdict === 'warning',
          },
        ],
      };
    }),
  );

  protected readonly nextCheck = computed(() => Math.min(CHECK_STEP, this.scan.unchecked().length));

  /** Reply history is only known once the notifications have been read. */
  protected readonly noFollowTimes = computed(() =>
    (this.state()?.people ?? []).every((e) => e.followedAt === null && !e.repliedToYou),
  );

  /** People whose own server is being asked, or refused. */
  protected readonly asking = signal<ReadonlySet<string>>(new Set());
  protected readonly refused = signal<ReadonlySet<string>>(new Set());

  protected async askOrigin(e: Evidence): Promise<void> {
    const id = e.account.id;
    this.asking.update((set) => new Set([...set, id]));
    const ok = await this.scan.askOrigin(e);
    this.asking.update((set) => new Set([...set].filter((x) => x !== id)));
    if (!ok) this.refused.update((set) => new Set([...set, id]));
  }

  protected link(account: Account): (string | number)[] {
    return accountProfilePath(account);
  }

  protected iso(at: number): string {
    return new Date(at).toISOString();
  }

  /** Numbers in reasons, for the reader's locale. */
  protected params(reason: Reason): Record<string, string> {
    return Object.fromEntries(
      Object.entries(reason.params ?? {}).map(([k, v]) => [
        k,
        typeof v === 'number' ? v.toLocaleString() : v,
      ]),
    );
  }

  protected fmt(n: number): string {
    return n.toLocaleString();
  }
}
