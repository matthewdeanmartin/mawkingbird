export interface WidgetState {
  playing?: boolean;
  time?: number;
  duration?: number;
  ended?: boolean;
  error?: boolean;
  /** Recording metadata reported by the widget itself, when the protocol offers it. */
  title?: string;
  artist?: string;
}
export interface WidgetController {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  volume(value: number): void;
  destroy(): void;
}

/** Minimal bridges matching the providers' official widget message protocols.
 * https://w.soundcloud.com/player/api.js
 * https://widget.mixcloud.com/media/js/widgetApi.js
 * No provider JavaScript executes in our credential-bearing document.
 */
export function connectWidget(
  provider: string,
  frame: HTMLIFrameElement,
  update: (state: WidgetState) => void,
): Promise<WidgetController> {
  if (!['soundcloud', 'mixcloud'].includes(provider))
    return Promise.reject(new Error('Unsupported controller'));
  const soundcloud = provider === 'soundcloud';
  const origin = soundcloud ? 'https://w.soundcloud.com' : 'https://player-widget.mixcloud.com';
  let alive = true;
  let ready = false;
  let methodId = 0;
  const pending = new Map<number, string>();
  const send = (message: unknown) => {
    if (alive && frame.isConnected)
      frame.contentWindow?.postMessage(JSON.stringify(message), origin);
  };
  const command = (method: string, value?: number) => {
    if (!ready) return;
    if (soundcloud) send({ method, value: value ?? null });
    else {
      const id = ++methodId;
      if (pending.size >= 50) pending.clear();
      pending.set(id, method);
      send({
        type: 'method',
        data: { methodId: id, methodName: method, args: value === undefined ? [] : [value] },
      });
    }
  };
  const soundEvents = ['play', 'pause', 'playProgress', 'finish', 'error'];
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      frame.removeEventListener('load', handshake);
      pending.clear();
    };
    const controller: WidgetController = {
      play: () => command('play'),
      pause: () => command('pause'),
      seek: (seconds) =>
        command(soundcloud ? 'seekTo' : 'seek', soundcloud ? seconds * 1000 : seconds),
      volume: (value) => {
        if (soundcloud) command('setVolume', value * 100);
      },
      destroy: () => {
        command('pause');
        if (soundcloud)
          for (const event of soundEvents) send({ method: 'removeEventListener', value: event });
        cleanup();
      },
    };
    const complete = () => {
      if (!ready) {
        ready = true;
        clearTimeout(timer);
        resolve(controller);
      }
    };
    const fail = () => {
      if (!ready) {
        cleanup();
        reject(new Error('Widget failed'));
      } else update({ error: true });
    };
    const receive = (event: MessageEvent) => {
      if (!alive || event.origin !== origin || event.source !== frame.contentWindow) return;
      let message: {
        method?: string;
        value?: unknown;
        mixcloud?: string;
        type?: string;
        data?: {
          eventName?: string;
          args?: unknown[];
          methods?: string[];
          methodId?: number;
          value?: unknown;
        };
      };
      try {
        message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!message || typeof message !== 'object') return;
      if (soundcloud) {
        switch (message.method) {
          case 'ready':
            for (const name of soundEvents) send({ method: 'addEventListener', value: name });
            complete();
            command('getDuration');
            command('getCurrentSound');
            break;
          case 'play':
            update({ playing: true });
            command('getDuration');
            break;
          case 'getCurrentSound': {
            const sound = message.value as { title?: unknown; user?: { username?: unknown } };
            const title = typeof sound?.title === 'string' ? sound.title.trim().slice(0, 200) : '';
            const artist = sound?.user?.username;
            if (title)
              update({
                title,
                ...(typeof artist === 'string' && artist ? { artist: artist.slice(0, 100) } : {}),
              });
            break;
          }
          case 'pause':
            update({ playing: false });
            break;
          case 'finish':
            update({ playing: false, ended: true });
            break;
          case 'error':
            fail();
            break;
          case 'getDuration':
            if (typeof message.value === 'number') update({ duration: message.value / 1000 });
            break;
          case 'playProgress': {
            const value = message.value as { currentPosition?: unknown } | null;
            if (typeof value?.currentPosition === 'number')
              update({ time: value.currentPosition / 1000 });
            break;
          }
        }
      } else {
        if (message.mixcloud !== 'playerWidget') return;
        if (message.type === 'ready') handshake();
        else if (message.type === 'api') {
          if (
            Array.isArray(message.data?.methods) &&
            ['play', 'pause', 'seek'].every((method) => message.data!.methods!.includes(method))
          )
            complete();
          else fail();
        } else if (message.type === 'methodResponse') {
          const id = message.data?.methodId;
          if (id !== undefined && pending.has(id)) {
            if (pending.get(id) === 'play' && message.data?.value === false)
              update({ error: true });
            pending.delete(id);
          }
        } else if (message.type === 'event') {
          const data = message.data;
          switch (data?.eventName) {
            case 'play':
              update({ playing: true });
              break;
            case 'pause':
              update({ playing: false });
              break;
            case 'ended':
              update({ playing: false, ended: true });
              break;
            case 'error':
              fail();
              break;
            case 'progress':
              if (
                Array.isArray(data.args) &&
                typeof data.args[0] === 'number' &&
                typeof data.args[1] === 'number'
              )
                update({ time: data.args[0], duration: data.args[1] });
              break;
          }
        }
      }
    };
    const handshake = () => {
      if (!soundcloud) send({ type: 'getApi' });
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Widget timed out'));
    }, 20_000);
    window.addEventListener('message', receive);
    frame.addEventListener('load', handshake);
    handshake();
  });
}
