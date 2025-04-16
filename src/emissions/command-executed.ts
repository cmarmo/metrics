import { CommandRegistry } from '@lumino/commands';
import { JSONObject } from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { IMetrics } from '..';

/**
 * Metrics data for a command executed event.
 */
export type CommandExecuted = {
  args?: JSONObject;

  command: string;

  label?: string;
};

/**
 * A namespace for command executed metrics.
 */
export namespace CommandExecuted {
  /**
   * The event schema version.
   */
  export const VERSION = '1';

  /**
   * The event schema URL.
   */
  export const SCHEMA = `https://schema.notebook.link/metrics/command-executed/v${VERSION}`;

  /**
   * Listens for command executed events and broadcasts them.
   * @param emitter - An event emitter, e.g. JupyterLab's event manager.
   * @param commands - A command registry.
   * @returns a disposable that stops broadcasting when disposed.
   */
  export function broadcast(
    emitter: IMetrics.Event.Emitter,
    commands: CommandRegistry
  ): IDisposable {
    const handler = (
      _: unknown,
      { args, id }: CommandRegistry.ICommandExecutedArgs
    ) => {
      const { SCHEMA, VERSION } = CommandExecuted;
      const data: IMetrics.Event<CommandExecuted> = {
        level: { anonymous: false, sensitivity: 'high' },
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
