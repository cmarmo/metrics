import { JupyterFrontEnd } from '@jupyterlab/application';
import { Event as JupyterEvent } from '@jupyterlab/services';
import { CommandRegistry } from '@lumino/commands';
import { JSONObject, Token } from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { FocusTracker, Widget } from '@lumino/widgets';

export namespace IMetrics {
  export const COLLECTOR = '@notebook-link/metrics:collector';

  export const EMITTER = '@notebook-link/metrics:emitter';

  export const ICollector = new Token<ICollector>(COLLECTOR);

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

    export const timestamp = () => new Date().toISOString();

    export type CommandExecuted = {
      label?: string;

      command: string;

      args?: JSONObject;
    };

    export namespace CommandExecuted {
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
            level: { anonymous: false, sensitivity: 'high' },
            metrics: {
              args: args as unknown as any,
              command: id,
              label: commands.label(id, args) || commands.caption(id, args)
            },
            timestamp: timestamp()
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
            level: { anonymous: false, sensitivity: 'high' },
            metrics: { label: newValue.title.label || newValue.title.caption },
            timestamp: timestamp()
          };
          void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
        };
        shell.currentChanged?.connect(handler);
        return new DisposableDelegate(() => {
          shell.currentChanged?.disconnect(handler);
        });
      }
    }

    export type RuntimeError = { type: string; description: string };

    export namespace RuntimeError {
      export const VERSION = '1';

      export const SCHEMA = `${SCHEMAS}/metrics/runtime-error/v${VERSION}`;

      export function broadcast(emitter: Emitter): IDisposable {
        const errorHandler = (error: ErrorEvent) => {
          const data: Event<RuntimeError> = {
            level: { anonymous: false, sensitivity: 'high' },
            metrics: { description: error.message, type: 'window-level error' },
            timestamp: timestamp()
          };
          void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
        };
        const rejectionHandler = (error: PromiseRejectionEvent) => {
          const data: Event<RuntimeError> = {
            level: { anonymous: false, sensitivity: 'high' },
            metrics: {
              description: error.reason.message ?? 'onunhandledrejection',
              type: 'window-level unhandled rejection'
            },
            timestamp: timestamp()
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
