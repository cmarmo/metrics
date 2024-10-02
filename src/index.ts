import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { CommandRegistry } from '@lumino/commands';
import {
  DisposableDelegate,
  DisposableSet,
  IDisposable
} from '@lumino/disposable';
import { FocusTracker, Widget } from '@lumino/widgets';
import { IMetrics } from './metrics';

let deactivate: IDisposable | null = null;

const plugin: JupyterFrontEndPlugin<void> = {
  id: '@quantstack/metrics:plugin',
  description: 'An extension for metrics',
  autoStart: true,
  requires: [IMetrics.Provider],
  optional: [ISettingRegistry],
  activate: async (
    app: JupyterFrontEnd,
    provider: IMetrics.Provider,
    registry: ISettingRegistry | null
  ) => {
    try {
      if (registry) {
        const settings = await registry.load(plugin.id);
        console.log(`${plugin.id} settings loaded:`, settings.composite);
      }
    } catch (error) {
      console.error(`${plugin.id} settings load error:`, error);
    }
    // Disconnect signals if the plugin is deactivated.
    const { broadcast, receive } = Private;
    deactivate = DisposableSet.from([broadcast(app), receive(app, provider)]);
  },
  deactivate: () => deactivate?.dispose()
};

const provider: JupyterFrontEndPlugin<IMetrics.Provider> = {
  id: '@quantstack/metrics:provider',
  description: 'A provider for metrics',
  provides: IMetrics.Provider,
  activate: () => ({ collect: async () => undefined })
};

export default [plugin, provider];

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
      events.emit({
        schema_id: IMetrics.Event.CommandExecuted.SCHEMA,
        data: {
          metrics: {
            args: args as unknown as any,
            label: commands.label(id, args) || commands.caption(id, args),
            command: id
          }
        },
        version: IMetrics.Event.CommandExecuted.VERSION
      });
    };
    const currentChanged = (
      _: unknown,
      { newValue }: FocusTracker.IChangedArgs<Widget>
    ) => {
      if (newValue) {
        events.emit({
          schema_id: IMetrics.Event.CurrentChanged.SCHEMA,
          data: {
            metrics: { label: newValue.title.label || newValue.title.caption }
          },
          version: IMetrics.Event.CurrentChanged.VERSION
        });
      }
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
    provider: IMetrics.Provider
  ): IDisposable {
    let stop = false;
    void (async () => {
      await restored;
      for await (const event of events.stream) {
        if (stop) {
          break;
        }
        switch (event.schema_id) {
          case IMetrics.Event.CurrentChanged.SCHEMA:
            provider.collect(
              event.schema_id,
              event.metrics as unknown as IMetrics.Event.CurrentChanged
            );
            break;
          case IMetrics.Event.CommandExecuted.SCHEMA:
            provider.collect(
              event.schema_id,
              event.metrics as unknown as IMetrics.Event.CommandExecuted
            );
            break;
          default:
            continue;
        }
      }
    })();
    return new DisposableDelegate(() => (stop = true));
  }
}
