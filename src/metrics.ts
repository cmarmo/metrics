import { JupyterFrontEnd } from '@jupyterlab/application';
import { Event as JupyterEvent } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { CommandRegistry } from '@lumino/commands';
import { JSONObject, Token } from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { FocusTracker, Widget } from '@lumino/widgets';

export namespace IMetrics {
  export const COLLECTOR = '@notebook-link/metrics:collector';

  export const EMITTER = '@notebook-link/metrics:emitter';

  export const ICollector = new Token(COLLECTOR);

  export function dispatch(
    stream: JupyterEvent.Stream,
    collector: ICollector,
    settings: ISettingRegistry.ISettings
  ): IDisposable {
    let stopped = false;
    const guard: Event['level'] = { anonymous: true, sensitivity: 'low' };
    const allowed = ({ level }: Event): boolean => {
      if (guard.anonymous && !level.anonymous) {
        return false;
      }
      if (guard.sensitivity === 'low' && level.sensitivity !== 'low') {
        return false;
      }
      if (guard.sensitivity === 'moderate' && level.sensitivity === 'high') {
        return false;
      }
      return true;
    };
    const update = (settings: ISettingRegistry.ISettings) => {
      const anonymous = settings.get('anonymous').composite;
      const sensitivity = settings.get('sensitivity').composite;
      guard.anonymous = anonymous as Event['level']['anonymous'];
      guard.sensitivity = sensitivity as Event['level']['sensitivity'];
    };
    update(settings);
    settings.changed.connect(update);
    void (async () => {
      for await (const event of stream) {
        if (stopped) {
          return;
        }
        const { schema_id } = event;
        switch (schema_id) {
          case Event.CommandExecuted.SCHEMA:
          case Event.CurrentChanged.SCHEMA:
          case Event.RuntimeError.SCHEMA:
            if (allowed(event as unknown as Event)) {
              void collector.collect(schema_id, event as unknown as Event);
            }
            break;
          default:
            continue;
        }
      }
    })();
    return new DisposableDelegate(() => {
      stopped = true;
      settings.changed.disconnect(update);
    });
  }

  export interface ICollector {
    collect: (schema: string, event: Event) => Promise<void>;
  }

  export type Event<
    T = Event.CommandExecuted | Event.CurrentChanged | Event.RuntimeError
  > = {
    level: {
      anonymous: boolean;

      sensitivity: 'high' | 'moderate' | 'low';
    };

    metrics: T;

    /**
     * ISO timestamp
     */
    timestamp: string;
  };

  export namespace Event {
    const SCHEMAS = 'https://schema.notebook.link';

    export type Emitter = { emit(event: JupyterEvent.Request): Promise<void> };

    export type CommandExecuted = {
      label?: string;

      command: string;

      args?: JSONObject;
    };

    export namespace CommandExecuted {
      export const LEVEL: Event['level'] = {
        anonymous: false,
        sensitivity: 'high'
      };

      export const VERSION = '1';

      export const SCHEMA = `${SCHEMAS}/metrics/command-executed/v${VERSION}`;

      export function broadcast(
        emitter: Emitter,
        commands: CommandRegistry
      ): IDisposable {
        const handler = (
          _: unknown,
          { args, id }: CommandRegistry.ICommandExecutedArgs
        ) => {
          const { SCHEMA, VERSION } = CommandExecuted;
          const data: Event<CommandExecuted> = {
            level: LEVEL,
            metrics: {
              args: args as unknown as any,
              command: id,
              label: commands.label(id, args) || commands.caption(id, args)
            },
            timestamp: new Date().toISOString()
          };
          void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
        };
        commands.commandExecuted.connect(handler);
        return new DisposableDelegate(() => {
          commands.commandExecuted.disconnect(handler);
        });
      }
    }

    export type CurrentChanged = {
      label: string;
    };

    export namespace CurrentChanged {
      export const LEVEL: Event['level'] = {
        anonymous: false,
        sensitivity: 'high'
      };

      export const VERSION = '1';

      export const SCHEMA = `${SCHEMAS}/metrics/current-changed/v${VERSION}`;

      export function broadcast(
        emitter: Emitter,
        shell: JupyterFrontEnd.IShell
      ): IDisposable {
        const handler = (
          _: unknown,
          { newValue }: FocusTracker.IChangedArgs<Widget>
        ) => {
          if (newValue === null) {
            return;
          }
          const data: Event<CurrentChanged> = {
            level: LEVEL,
            metrics: { label: newValue.title.label || newValue.title.caption },
            timestamp: new Date().toISOString()
          };
          void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
        };
        shell.currentChanged?.connect(handler);
        return new DisposableDelegate(() => {
          shell.currentChanged?.disconnect(handler);
        });
      }
    }

    export type RuntimeError = {
      type: string;
      description: string;
    };

    export namespace RuntimeError {
      export const LEVEL: Event['level'] = {
        anonymous: false,
        sensitivity: 'high'
      };

      export const VERSION = '1';

      export const SCHEMA = `${SCHEMAS}/metrics/runtime-error/v${VERSION}`;

      export function broadcast(emitter: Emitter): IDisposable {
        const errorHandler = (error: ErrorEvent) => {
          const data: Event<RuntimeError> = {
            level: LEVEL,
            metrics: { description: error.message, type: 'window-level error' },
            timestamp: new Date().toISOString()
          };
          void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
        };
        const rejectionHandler = (error: PromiseRejectionEvent) => {
          const data: Event<RuntimeError> = {
            level: LEVEL,
            metrics: {
              description: error.reason.message ?? 'onunhandledrejection',
              type: 'window-level unhandled rejection'
            },
            timestamp: new Date().toISOString()
          };
          void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
        };
        window.addEventListener('error', errorHandler);
        window.addEventListener('unhandledrejection', rejectionHandler);
        return new DisposableDelegate(() => {
          window.removeEventListener('error', errorHandler);
          window.removeEventListener('unhandledrejection', rejectionHandler);
        });
      }
    }
  }
}
