import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { CommandRegistry } from '@lumino/commands';
import {
  DisposableDelegate,
  DisposableSet,
  IDisposable
} from '@lumino/disposable';
import { FocusTracker, Widget } from '@lumino/widgets';
import { IMetrics } from './metrics';

let deactivate: IDisposable | null = null;

const emitter: JupyterFrontEndPlugin<void> = {
  id: '@quantstack/metrics:emitter',
  description: 'An extension that emits metrics events',
  autoStart: true,
  requires: [IMetrics.Collector],
  activate: (app: JupyterFrontEnd, collector: IMetrics.Collector) => {
    deactivate = DisposableSet.from([
      Private.broadcast(app),
      Private.receive(app, collector)
    ]);
  },
  deactivate: () => deactivate?.dispose()
};

const collector: JupyterFrontEndPlugin<IMetrics.Collector> = {
  id: '@quantstack/metrics:collector',
  description: 'A collector for metrics emissions',
  provides: IMetrics.Collector,
  activate: () => ({ collect: async () => undefined })
};

export default [emitter, collector];

namespace Private {
  export function broadcast({
    commands,
    serviceManager: { events },
    shell
  }: JupyterFrontEnd): IDisposable {
    const commandExecuted = (
      _: unknown,
      { args, id }: CommandRegistry.ICommandExecutedArgs
    ) => {
      const data: IMetrics.Event<IMetrics.Event.CommandExecuted> = {
        metrics: {
          args: args as unknown as any,
          label: commands.label(id, args) || commands.caption(id, args),
          command: id
        },
        timestamp: new Date().toISOString()
      };
      events.emit({
        schema_id: IMetrics.Event.CommandExecuted.SCHEMA,
        data,
        version: IMetrics.Event.CommandExecuted.VERSION
      });
    };
    const currentChanged = (
      _: unknown,
      { newValue }: FocusTracker.IChangedArgs<Widget>
    ) => {
      if (newValue === null) {
        return;
      }
      const data: IMetrics.Event<IMetrics.Event.CurrentChanged> = {
        metrics: { label: newValue.title.label || newValue.title.caption },
        timestamp: new Date().toISOString()
      };
      void events.emit({
        schema_id: IMetrics.Event.CurrentChanged.SCHEMA,
        data,
        version: IMetrics.Event.CurrentChanged.VERSION
      });
    };
    commands.commandExecuted.connect(commandExecuted);
    shell.currentChanged?.connect(currentChanged);
    return new DisposableDelegate(() => {
      commands.commandExecuted.disconnect(commandExecuted);
      shell.currentChanged?.disconnect(currentChanged);
    });
  }

  export function receive(
    { restored, serviceManager: { events } }: JupyterFrontEnd,
    collector: IMetrics.Collector
  ): IDisposable {
    let stop = false;
    void (async () => {
      await restored;
      for await (const { metrics, schema_id, timestamp } of events.stream) {
        if (stop) {
          break;
        }
        switch (schema_id) {
          case IMetrics.Event.CurrentChanged.SCHEMA:
            collector.collect(schema_id, {
              metrics: metrics as unknown as IMetrics.Event.CurrentChanged,
              timestamp: timestamp as unknown as string
            });
            break;
          case IMetrics.Event.CommandExecuted.SCHEMA:
            collector.collect(schema_id, {
              metrics: metrics as unknown as IMetrics.Event.CommandExecuted,
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
