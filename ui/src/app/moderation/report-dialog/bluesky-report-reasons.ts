/**
 * Bluesky's report reasons (`tools.ozone.report.defs`), grouped as bsky.app
 * groups them, so a Bluesky report says exactly what is wrong
 * (spec/bsky_parity.md, sprint 5). Labels are i18n keys.
 */

// i18n report.bsky.reason: What's wrong?
// i18n report.bsky.sendTo: Send to
// i18n report.bsky.bluesky: Bluesky's moderation
// i18n report.bsky.group.misleading: Misleading
// i18n report.bsky.group.harassment: Harassment or hate
// i18n report.bsky.group.violence: Violence
// i18n report.bsky.group.sexual: Adult content
// i18n report.bsky.group.childSafety: Child safety
// i18n report.bsky.group.selfHarm: Self-harm
// i18n report.bsky.group.rules: Breaking site rules
// i18n report.bsky.group.other: Something else
// i18n report.bsky.misleadingSpam: Spam
// i18n report.bsky.misleadingScam: Scam
// i18n report.bsky.misleadingImpersonation: Impersonation
// i18n report.bsky.misleadingBot: Fake account or bot
// i18n report.bsky.misleadingElections: False information about elections
// i18n report.bsky.misleadingOther: Other misleading content
// i18n report.bsky.harassmentTroll: Trolling
// i18n report.bsky.harassmentTargeted: Targeted harassment
// i18n report.bsky.harassmentHateSpeech: Hate speech
// i18n report.bsky.harassmentDoxxing: Sharing someone's private information
// i18n report.bsky.harassmentOther: Other harassment
// i18n report.bsky.violenceThreats: Threats or incitement
// i18n report.bsky.violenceGraphicContent: Graphic violent content
// i18n report.bsky.violenceGlorification: Glorifying violence
// i18n report.bsky.violenceExtremistContent: Extremist content
// i18n report.bsky.violenceTrafficking: Human trafficking
// i18n report.bsky.violenceAnimal: Animal welfare
// i18n report.bsky.violenceOther: Other violent content
// i18n report.bsky.sexualUnlabeled: Adult content without a label
// i18n report.bsky.sexualNCII: Intimate images shared without consent
// i18n report.bsky.sexualDeepfake: Deepfake adult content
// i18n report.bsky.sexualAbuseContent: Sexual abuse content
// i18n report.bsky.sexualAnimal: Sexual content involving animals
// i18n report.bsky.sexualOther: Other sexual content
// i18n report.bsky.childSafetyCSAM: Child sexual abuse material
// i18n report.bsky.childSafetyGroom: Grooming or predatory behaviour
// i18n report.bsky.childSafetyPrivacy: A minor's private information
// i18n report.bsky.childSafetyHarassment: Harassment of a minor
// i18n report.bsky.childSafetyOther: Other child safety issue
// i18n report.bsky.selfHarmContent: Content promoting self-harm
// i18n report.bsky.selfHarmED: Eating disorders
// i18n report.bsky.selfHarmStunts: Dangerous challenges or stunts
// i18n report.bsky.selfHarmSubstances: Dangerous substances or drug abuse
// i18n report.bsky.selfHarmOther: Other self-harm
// i18n report.bsky.ruleSiteSecurity: Hacking or system attacks
// i18n report.bsky.ruleProhibitedSales: Selling prohibited items
// i18n report.bsky.ruleBanEvasion: Evading a ban
// i18n report.bsky.ruleOther: Other rule breaking
// i18n report.bsky.other: Something else

export type BskyReportReasonId = `tools.ozone.report.defs#${string}`;

export interface BskyReportGroup {
  key: string;
  reasons: { value: BskyReportReasonId; key: string }[];
}

const GROUPS: Record<string, string[]> = {
  misleading: ['Spam', 'Scam', 'Impersonation', 'Bot', 'Elections', 'Other'],
  harassment: ['Troll', 'Targeted', 'HateSpeech', 'Doxxing', 'Other'],
  violence: [
    'Threats',
    'GraphicContent',
    'Glorification',
    'ExtremistContent',
    'Trafficking',
    'Animal',
    'Other',
  ],
  sexual: ['Unlabeled', 'NCII', 'Deepfake', 'AbuseContent', 'Animal', 'Other'],
  childSafety: ['CSAM', 'Groom', 'Privacy', 'Harassment', 'Other'],
  selfHarm: ['Content', 'ED', 'Stunts', 'Substances', 'Other'],
};
const RULES = ['SiteSecurity', 'ProhibitedSales', 'BanEvasion', 'Other'];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export const BLUESKY_REPORT_GROUPS: readonly BskyReportGroup[] = [
  ...Object.entries(GROUPS).map(([group, names]) => ({
    key: `report.bsky.group.${group}`,
    reasons: names.map((name) => ({
      value: `tools.ozone.report.defs#reason${cap(group)}${name}` as BskyReportReasonId,
      key: `report.bsky.${group}${name}`,
    })),
  })),
  {
    key: 'report.bsky.group.rules',
    reasons: RULES.map((name) => ({
      value: `tools.ozone.report.defs#reasonRule${name}` as BskyReportReasonId,
      key: `report.bsky.rule${name}`,
    })),
  },
  {
    key: 'report.bsky.group.other',
    reasons: [{ value: 'tools.ozone.report.defs#reasonOther', key: 'report.bsky.other' }],
  },
];

/** The detailed reason a Mastodon-style category starts from. */
export function defaultBlueskyReason(category: string): BskyReportReasonId {
  return category === 'spam'
    ? 'tools.ozone.report.defs#reasonMisleadingSpam'
    : category === 'violation'
      ? 'tools.ozone.report.defs#reasonRuleOther'
      : 'tools.ozone.report.defs#reasonOther';
}
