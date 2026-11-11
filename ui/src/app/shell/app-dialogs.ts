import { DOCUMENT } from '@angular/common';
import {
  ApplicationRef,
  EnvironmentInjector,
  Injectable,
  createComponent,
  inject,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
  inputLabel?: string;
}

// i18n dialogs.confirmTitle: Are you sure?
// i18n dialogs.alertTitle: Notice
// i18n dialogs.promptTitle: Enter a value
// i18n dialogs.continue: Continue
// i18n dialogs.ok: OK
// i18n dialogs.value: Value
@Injectable({ providedIn: 'root' })
export class AppDialogs {
  private readonly i18n = inject(TranslocoService);
  private readonly app = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly document = inject(DOCUMENT);
  private queue: Promise<unknown> = Promise.resolve();
  private readonly pending = new Set<string>();

  confirm(message: string, options: DialogOptions = {}): Promise<boolean> {
    return this.open('confirm', message, options).then((value) => value !== null);
  }

  alert(message: string, options: DialogOptions = {}): Promise<void> {
    return this.open('alert', message, options).then(() => undefined);
  }

  prompt(message: string, initialValue = '', options: DialogOptions = {}): Promise<string | null> {
    return this.open('prompt', message, options, initialValue);
  }

  private open(
    mode: 'alert' | 'confirm' | 'prompt',
    message: string,
    options: DialogOptions,
    initialValue = '',
  ): Promise<string | null> {
    const key = JSON.stringify([mode, message, options, initialValue]);
    // A double click must not queue a second destructive action behind the first.
    if (this.pending.has(key)) return Promise.resolve(null);
    this.pending.add(key);
    const result = this.queue.then(async () => {
      const { ConfirmDialog } = await import('./confirm-dialog/confirm-dialog');
      return new Promise<string | null>((resolve) => {
        const host = this.document.createElement('app-confirm-dialog');
        const ref = createComponent(ConfirmDialog, {
          environmentInjector: this.injector,
          hostElement: host,
        });
        const titleKey = {
          alert: 'dialogs.alertTitle',
          confirm: 'dialogs.confirmTitle',
          prompt: 'dialogs.promptTitle',
        }[mode];
        ref.setInput('title', options.title ?? this.i18n.translate(titleKey));
        ref.setInput('message', message);
        ref.setInput(
          'confirmLabel',
          options.confirmLabel ??
            this.i18n.translate(mode === 'confirm' ? 'dialogs.continue' : 'dialogs.ok'),
        );
        ref.setInput('danger', options.danger ?? false);
        ref.setInput('mode', mode);
        ref.setInput('inputLabel', options.inputLabel ?? this.i18n.translate('dialogs.value'));
        ref.instance.value.set(initialValue);
        let settled = false;
        const finish = (value: string | null) => {
          if (settled) return;
          settled = true;
          this.app.detachView(ref.hostView);
          ref.destroy();
          host.remove();
          resolve(value);
        };
        ref.instance.confirmed.subscribe(() => finish(ref.instance.value()));
        ref.instance.cancelled.subscribe(() => finish(null));
        this.document.body.appendChild(host);
        this.app.attachView(ref.hostView);
        ref.changeDetectorRef.detectChanges();
      });
    });
    this.queue = result.catch(() => undefined);
    return result.finally(() => this.pending.delete(key));
  }
}
