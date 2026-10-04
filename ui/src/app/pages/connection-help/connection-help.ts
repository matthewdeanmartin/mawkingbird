import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPageHeader, MbSection } from '../../design-system/page-header/page-header';
import { MbDisclosure } from '../../design-system/disclosure/disclosure';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { connectionHelpServer, isPrivateNetworkServer } from '../../host-url';
@Component({
  selector: 'app-connection-help',
  imports: [RouterLink, TranslocoPipe, MbPageHeader, MbSection, MbDisclosure, MbContentLink],
  templateUrl: './connection-help.html',
  styleUrl: './connection-help.css',
})
export class ConnectionHelp {
  protected readonly server = connectionHelpServer(
    inject(ActivatedRoute).snapshot.queryParamMap.get('server'),
  );
  protected readonly trustUrl = isPrivateNetworkServer(this.server ?? '')
    ? this.server!.replace(/^https:/, 'http:') + '/trust'
    : 'http://mastomini.local/trust';
}

// i18n connectionHelp.title: Connecting to your server
// i18n connectionHelp.back: Back to sign in
// i18n connectionHelp.intro: A failed connection can mean an address problem, a blocked network, missing local network permission, or a certificate your device does not trust.
// i18n connectionHelp.first: First, open the server
// i18n connectionHelp.open: Open server in a new tab
// i18n connectionHelp.diagnosis: A browser tab can show the certificate warning, DNS error, or firewall page that this app cannot read. If a public server has a certificate warning, ask its administrator to fix it. Install a private CA only for a server whose owner you trust.
// i18n connectionHelp.network: Local network access
// i18n connectionHelp.permission: Use the same Wi-Fi as the server. In the picker, choose the local server or press Connect to local server. Allow local network access for Mawkingbird if your browser asks. If you denied it earlier, review this site's permissions; on Apple devices, also check the browser's Local Network permission in system settings. Certificate trust and network permission are separate.
// i18n connectionHelp.localNames: Some devices cannot resolve .local names. Ask the owner for the board's IP address and use https:// followed by that address only if it is listed on the certificate. Guest Wi-Fi, VPNs, and network isolation can prevent access. Local server checks wait up to 15 seconds for discovery and slower hardware.
// i18n connectionHelp.ca: Trust a household certificate
// i18n connectionHelp.download: Open Mastomini's certificate setup page
// i18n connectionHelp.verify: Mastomini serves /trust over HTTP and downloads the CA there. Before installing, compare the downloaded certificate's SHA-256 fingerprint with the owner through a separate trusted channel. The owner can obtain it from make certs. The HTTP page alone cannot prove it is genuine. Trusting a CA lets it vouch for the certificates it signs.
// i18n connectionHelp.otherServer: For other private servers, get the CA and fingerprint directly from the owner. These steps apply to a CA certificate, not an arbitrary server certificate.
// i18n connectionHelp.ios: iPhone / iPad
// i18n connectionHelp.iosSteps: Download in Safari and allow the profile. Open Settings → General → VPN & Device Management, select the downloaded profile, and install. Then open General → About → Certificate Trust Settings and enable full trust for that CA. Installing alone is not enough.
// i18n connectionHelp.android: Android
// i18n connectionHelp.androidSteps: Download the CA. Open Settings → Security & privacy → More security settings → Encryption & credentials → Install a certificate → CA certificate, and select the file. Names vary by phone. Chrome can use user-installed CAs; native apps may have different trust rules.
// i18n connectionHelp.mac: Mac
// i18n connectionHelp.macSteps: Open the downloaded CA in Keychain Access. Find that certificate, double-click it, expand Trust, and set When using this certificate to Always Trust. Confirm the change when prompted.
// i18n connectionHelp.windows: Windows
// i18n connectionHelp.windowsSteps: Open the downloaded CA → Install Certificate → Current User. Choose Place all certificates in the following store → Trusted Root Certification Authorities, then finish. This trusts it for your Windows user.
// i18n connectionHelp.linux: Linux
// i18n connectionHelp.linuxSteps: On Debian / Ubuntu, download the PEM version from /ca.pem, save it as mastomini.crt, and run the commands below. Other distributions and browser packages may use a different trust store; follow their documentation or import it in Firefox.
// i18n connectionHelp.firefox: Firefox
// i18n connectionHelp.firefoxSteps: Firefox may already use your operating system's trusted CAs. If it still reports an untrusted issuer, open Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import. Select the verified CA and allow it to identify websites.
// i18n connectionHelp.platformDocs: Platform instructions
// i18n connectionHelp.finish: Check the secure connection
// i18n connectionHelp.finishSteps: Restart the browser if needed, then open your server's HTTPS address. It should load without a certificate warning. Do not click past a warning. Return to Mawkingbird, choose the HTTPS server, and retry. If it still fails, check the device's clock, certificate expiry, and that the hostname or IP matches; the owner may need to reissue it.
// i18n connectionHelp.firewall: Still cannot connect? Network Doctor checks public services without your login credentials and helps identify network blocks and browser restrictions. Checks run only when you ask.
