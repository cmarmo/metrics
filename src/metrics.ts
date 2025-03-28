import { JupyterFrontEnd } from '@jupyterlab/application';
import { Event as JupyterEvent } from '@jupyterlab/services';
import { CommandRegistry } from '@lumino/commands';
import { JSONObject, Token } from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { FocusTracker, Widget } from '@lumino/widgets';

/**
 * The namespace for the metrics extension.
 */
export namespace IMetrics {
  /**
   * ID of the collector plugin.
   */
  export const COLLECTOR = '@notebook-link/metrics:collector';

  /**
   * ID of the emitter plugin.
   */
  export const EMITTER = '@notebook-link/metrics:emitter';

  /**
   * Token for requiring/providing a collector plugin.
   */
  export const ICollector = new Token<ICollector>(COLLECTOR);

  /**
   * The public API of a collector plugin.
   */
  export interface ICollector {
    collect: (schema: string, event: Event) => Promise<void>;
  }

  /**
   * A generic metrics event.
   * @typeparam T - The type of the metrics payload of the event.
   */
  export type Event<
    T = Event.CommandExecuted | Event.CurrentChanged | Event.RuntimeError
  > = {
    /**
     * Whether the metrics data is anonymous and how sensitive it is.
     */
    level: { anonymous: boolean; sensitivity: 'high' | 'moderate' | 'low' };

    /**
     * The metrics payload.
     */
    metrics: T;

    /**
     * The event timestamp as a string in ISO format.
     */
    timestamp: string;
  };

  /**
   * The metrics event namespace.
   */
  export namespace Event {
    const SCHEMAS = 'https://schema.notebook.link';

    const timestamp = () => new Date().toISOString();

    /**
     * A minimal emitter of events
     * (compatible with e.g., Event.IManager from @jupyterlab/services).
     */
    export type Emitter = { emit(event: JupyterEvent.Request): Promise<void> };

    /**
     * Metrics data for a command executed event.
     */
    export type CommandExecuted = {
      args?: JSONObject;

      command: string;

      label?: string;
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

    export type CurrentChanged = { label: string };

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
