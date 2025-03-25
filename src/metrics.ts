import { JupyterFrontEnd } from '@jupyterlab/application';
import { Event as JupyterEvent, ServerConnection } from '@jupyterlab/services';
import { CommandRegistry } from '@lumino/commands';
import { JSONObject, Token } from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { FocusTracker, Widget } from '@lumino/widgets';

export namespace IMetrics {
  export const ICollector = new Token('@quantstack/metrics:collector');

  export function dispatch(
    events: JupyterEvent.IManager,
    collector: ICollector
  ): IDisposable {
    let stop = false;
    void (async () => {
      for await (const event of events.stream) {
        if (stop) {
          break;
        }
        const { level, metrics, schema_id, timestamp } = event;
        switch (schema_id) {
          case Event.CommandExecuted.SCHEMA:
            void collector.collect(schema_id, {
              level: level as unknown as Event['level'],
              metrics: metrics as unknown as Event.CommandExecuted,
              timestamp: timestamp as unknown as Event['timestamp']
            });
            break;
          case Event.CurrentChanged.SCHEMA:
            void collector.collect(schema_id, {
              level: level as unknown as Event['level'],
              metrics: metrics as unknown as Event.CurrentChanged,
              timestamp: timestamp as unknown as Event['timestamp']
            });
            break;
          case Event.RuntimeError.SCHEMA:
            void collector.collect(schema_id, {
              level: level as unknown as Event['level'],
              metrics: metrics as unknown as Event.RuntimeError,
              timestamp: timestamp as unknown as Event['timestamp']
            });
            break;
          default:
            continue;
        }
      }
    })();
    return new DisposableDelegate(() => void (stop = true));
  }

  export interface ICollector {
    collect: (schema: string, event: Event) => Promise<void>;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  export interface Event<
    T = Event.CommandExecuted | Event.CurrentChanged | Event.RuntimeError
  > {
    level: {
      anonymous: boolean;

      sensitivity: 'high' | 'moderate' | 'low';
    };

    metrics: T;

    /**
     * ISO timestamp
     */
    timestamp: string;
  }

  export namespace Event {
    const SCHEMAS = 'https://quantstack.net/schema';

    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface CommandExecuted {
      label?: string;

      command: string;

      args?: JSONObject;
    }

    export namespace CommandExecuted {
      export const VERSION = '1';

      export const SCHEMA = `${SCHEMAS}/metrics/command-executed/v${VERSION}`;

      export function broadcast(
        events: JupyterEvent.IManager,
        commands: CommandRegistry
      ): IDisposable {
        const commandExecuted = (
          _: unknown,
          { args, id }: CommandRegistry.ICommandExecutedArgs
        ) => {
          const { SCHEMA, VERSION } = CommandExecuted;
          const data: Event<CommandExecuted> = {
            level: { anonymous: false, sensitivity: 'high' },
            metrics: {
              args: args as unknown as any,
              command: id,
              label: commands.label(id, args) || commands.caption(id, args)
            },
            timestamp: new Date().toISOString()
          };
          const event = { data, schema_id: SCHEMA, version: VERSION };
          void events.emit(event);
        };
        commands.commandExecuted.connect(commandExecuted);
        return new DisposableDelegate(() => {
          commands.commandExecuted.disconnect(commandExecuted);
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface CurrentChanged {
      label: string;
    }

    export namespace CurrentChanged {
      export const VERSION = '1';

      export const SCHEMA = `${SCHEMAS}/metrics/current-changed/v${VERSION}`;

      export function broadcast(
        events: JupyterEvent.IManager,
        shell: JupyterFrontEnd.IShell
      ): IDisposable {
        const handler = (
          _: unknown,
          { newValue }: FocusTracker.IChangedArgs<Widget>
        ) => {
          if (newValue === null) {
            return;
          }
          const { SCHEMA, VERSION } = CurrentChanged;
          const data: Event<CurrentChanged> = {
            level: { anonymous: false, sensitivity: 'high' },
            metrics: { label: newValue.title.label || newValue.title.caption },
            timestamp: new Date().toISOString()
          };
          const event = { data, schema_id: SCHEMA, version: VERSION };
          void events.emit(event);
        };
        shell.currentChanged?.connect(handler);
        return new DisposableDelegate(() => {
          shell.currentChanged?.disconnect(handler);
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface RuntimeError {
      type: string;
      description: string;
    }

    export namespace RuntimeError {
      export const VERSION = '1';

      export const SCHEMA = `${SCHEMAS}/metrics/runtime-error/v${VERSION}`;

      export function broadcast(events: JupyterEvent.IManager): IDisposable {
        window.onerror = (event, source, lineno, colno, error) => {
          console.log('onerror', event, source, lineno, colno, error);
          void events.emit({
            schema_id: SCHEMA,
            version: VERSION,
            data: {
              description: error?.message ?? 'captured by window.onerror',
              type: 'window-level error'
            }
          });
        };
        window.onunhandledrejection = async event => {
          console.log('onunhandledrejection event:', event);
          try {
            const data = {};
            await events.emit({ schema_id: SCHEMA, version: VERSION, data });
          } catch (error) {
            const { response } = error as ServerConnection.ResponseError;
            console.warn((await response.json()).message);
          }
        };
        return new DisposableDelegate(() => undefined);
      }
    }
  }
}
