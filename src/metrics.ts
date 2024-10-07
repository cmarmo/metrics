import { JupyterFrontEnd } from '@jupyterlab/application';
import { CommandRegistry } from '@lumino/commands';
import { JSONObject, Token } from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { FocusTracker, Widget } from '@lumino/widgets';

export namespace IMetrics {
  export const Collector = new Token('@quantstack/metrics:collector');

  // eslint-disable-next-line @typescript-eslint/naming-convention
  export interface Collector {
    collect: (schema: string, event: Event) => Promise<void>;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  export interface Event<T = Event.CommandExecuted | Event.CurrentChanged> {
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

      export function broadcast(app: JupyterFrontEnd): IDisposable {
        const { commands, serviceManager } = app;
        const commandExecuted = (
          _: unknown,
          { args, id }: CommandRegistry.ICommandExecutedArgs
        ) => {
          const { SCHEMA, VERSION } = CommandExecuted;
          const data: Event<CommandExecuted> = {
            metrics: {
              args: args as unknown as any,
              command: id,
              label: commands.label(id, args) || commands.caption(id, args)
            },
            timestamp: new Date().toISOString()
          };
          const event = { data, schema_id: SCHEMA, version: VERSION };
          void serviceManager.events.emit(event);
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

      export function broadcast(app: JupyterFrontEnd): IDisposable {
        const { serviceManager, shell } = app;
        const currentChanged = (
          _: unknown,
          { newValue }: FocusTracker.IChangedArgs<Widget>
        ) => {
          if (newValue === null) {
            return;
          }
          const { SCHEMA, VERSION } = CurrentChanged;
          const data: Event<CurrentChanged> = {
            metrics: { label: newValue.title.label || newValue.title.caption },
            timestamp: new Date().toISOString()
          };
          const event = { data, schema_id: SCHEMA, version: VERSION };
          void serviceManager.events.emit(event);
        };
        shell.currentChanged?.connect(currentChanged);
        return new DisposableDelegate(() => {
          shell.currentChanged?.disconnect(currentChanged);
        });
      }
    }

    export function dispatch(
      { restored, serviceManager: { events } }: JupyterFrontEnd,
      collector: Collector
    ): IDisposable {
      let stop = false;
      void (async () => {
        await restored;
        for await (const { metrics, schema_id, timestamp } of events.stream) {
          if (stop) {
            break;
          }
          switch (schema_id) {
            case CommandExecuted.SCHEMA:
              collector.collect(schema_id, {
                metrics: metrics as unknown as CommandExecuted,
                timestamp: timestamp as unknown as string
              });
              break;
            case CurrentChanged.SCHEMA:
              collector.collect(schema_id, {
                metrics: metrics as unknown as CurrentChanged,
                timestamp: timestamp as unknown as string
              });
              break;
            default:
              continue;
          }
        }
      })();
      return new DisposableDelegate(() => void (stop = true));
    }
  }
}
