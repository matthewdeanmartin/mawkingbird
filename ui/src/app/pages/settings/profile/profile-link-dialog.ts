import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../../design-system/button/button';
import { MbDialog } from '../../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../../design-system/field/field';
import { AccountField } from '../../../models';

type ProfileSite = 'mastodon' | 'github' | 'gitlab';

/** Build plain profile-field values; the server owns rel=me markup and verification. */
export function profileLink(site: ProfileSite, value: string): string | null {
  const username = value.trim().replace(/^@/, '');
  if (site === 'mastodon') {
    const match = /^([a-z\d_]+)@([a-z\d](?:[a-z\d.-]*[a-z\d])?)$/i.exec(username);
    if (!match || !match[2].includes('.') || match[2].includes('..')) return null;
    return `https://${match[2].toLowerCase()}/@${match[1]}`;
  }
  if (
    site === 'github' &&
    (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username) || username.includes('--'))
  )
    return null;
  if (!/^[a-z\d_](?:[a-z\d_.-]*[a-z\d_])?$/i.test(username) || username.includes('..')) return null;
  return `https://${site === 'github' ? 'github.com' : 'gitlab.com'}/${username}`;
}

function webLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// i18n settings.profile.link.add: Add a link
// i18n settings.profile.link.other: Add link to my other profiles
// i18n settings.profile.link.intro: Add a link to your profile. You can review it before choosing Save changes.
// i18n settings.profile.link.label: What should the link be called?
// i18n settings.profile.link.labelHint: For example, My website, Blog, or Portfolio.
// i18n settings.profile.link.url: Website address
// i18n settings.profile.link.urlHint: Paste the full link, starting with https:// or http://.
// i18n settings.profile.link.labelError: Give your link a name.
// i18n settings.profile.link.urlError: Enter a full http:// or https:// address without a username or password.
// i18n settings.profile.link.site: Profile site
// i18n settings.profile.link.site.mastodon: Mastodon
// i18n settings.profile.link.site.github: GitHub
// i18n settings.profile.link.site.gitlab: GitLab.com
// i18n settings.profile.link.username: Your username
// i18n settings.profile.link.usernameHint: Enter your username on this site, with or without the leading @.
// i18n settings.profile.link.mastodonHint: Include your server, for example @alice@mastodon.social.
// i18n settings.profile.link.usernameError: Enter a username, not a link. For Mastodon, include your server: alice@mastodon.social.
// i18n settings.profile.link.preview: Profile address
// i18n settings.profile.link.verification: To verify this link, add a link back to your Mastodon profile on the other site, then save your changes here. Your server checks the link; adding it here does not verify it automatically.
// i18n settings.profile.link.local: This profile is saved only in this browser. Links added here are not published or verified.
// i18n settings.profile.link.cancel: Cancel
// i18n settings.profile.link.submit: Add to profile
@Component({
  selector: 'app-profile-link-dialog',
  imports: [FormsModule, TranslocoPipe, MbButton, MbDialog, MbField, MbControl],
  templateUrl: './profile-link-dialog.html',
  styles: `
    .link-fields {
      display: grid;
      gap: 16px;
    }
  `,
})
export class ProfileLinkDialog {
  readonly mode = input.required<'link' | 'profile'>();
  readonly local = input(false);
  readonly added = output<AccountField>();
  readonly closed = output<void>();
  protected readonly label = signal('');
  protected readonly address = signal('');
  protected readonly site = signal<ProfileSite>('mastodon');
  protected readonly username = signal('');
  protected readonly attempted = signal(false);
  protected readonly profileAddress = computed(() => profileLink(this.site(), this.username()));
  protected readonly validAddress = computed(() => webLink(this.address()));

  protected submit(): void {
    this.attempted.set(true);
    if (this.mode() === 'link') {
      const name = this.label().trim();
      const value = this.validAddress();
      if (name && value) this.added.emit({ name, value });
    } else {
      const value = this.profileAddress();
      const names: Record<ProfileSite, string> = {
        mastodon: 'Mastodon',
        github: 'GitHub',
        gitlab: 'GitLab',
      };
      if (value) this.added.emit({ name: names[this.site()], value });
    }
  }
}
