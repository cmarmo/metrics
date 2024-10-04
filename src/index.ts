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

const emitter: JupyterFrontEndPlugin<void> = {
  id: '@quantstack/metrics:emitter',
  description: 'An extension that emits metrics events',
  autoStart: true,
  requires: [IMetrics.Collector],
  ...((set?: IDisposable) => ({
    activate: (app: JupyterFrontEnd, collector: IMetrics.Collector) => {
      const { broadcast, receive } = Private;
      set = DisposableSet.from([broadcast(app), receive(app, collector)]);
    },
    deactivate: () => set?.dispose()
  }))()
};

const collector: JupyterFrontEndPlugin<IMetrics.Collector> = {
  id: '@quantstack/metrics:collector',
  description: 'A collector for metrics emissions',
  provides: IMetrics.Collector,
  activate: () => ({ collect: async () => undefined })
};

export default [emitter, collector];

namespace Private {
  export function broadcast(app: JupyterFrontEnd): IDisposable {
    const { commands, serviceManager, shell } = app;
    const commandExecuted = (
      _: unknown,
      { args, id }: CommandRegistry.ICommandExecutedArgs
    ) => {
      const { SCHEMA, VERSION } = IMetrics.Event.CommandExecuted;
      const data: IMetrics.Event<IMetrics.Event.CommandExecuted> = {
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
    const currentChanged = (
      _: unknown,
      { newValue }: FocusTracker.IChangedArgs<Widget>
    ) => {
      if (newValue === null) {
        return;
      }
      const { SCHEMA, VERSION } = IMetrics.Event.CurrentChanged;
      const data: IMetrics.Event<IMetrics.Event.CurrentChanged> = {
        metrics: { label: newValue.title.label || newValue.title.caption },
        timestamp: new Date().toISOString()
      };
      const event = { data, schema_id: SCHEMA, version: VERSION };
      void serviceManager.events.emit(event);
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
