import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { CommandRegistry } from '@lumino/commands';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { FocusTracker, Widget } from '@lumino/widgets';
import { IMetrics } from './metrics';

let deactivate: IDisposable | null;

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
    // Store broadcast signal disconnection in case the plugin is deactivated.
    deactivate = Private.broadcast(app);
    void Private.receive(app, provider);
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
    const activityHandler = (_: unknown, { newValue }: FocusTracker.IChangedArgs<Widget>) => {
      console.log('newValue', newValue?.title.label);
    }
    const commandHandler = (_: unknown, { args, id }: CommandRegistry.ICommandExecutedArgs) => {
      events.emit({
        schema_id: IMetrics.Event.Command.SCHEMA,
        data: { metrics: { command: id, args: args as unknown as any } },
        version: IMetrics.Event.Command.VERSION
      });
    };
    commands.commandExecuted.connect(commandHandler);
    shell.currentChanged?.connect(activityHandler);
    return new DisposableDelegate(() => {
      commands.commandExecuted.disconnect(commandHandler);
      shell.currentChanged?.disconnect(activityHandler);
    });
  }

  export async function receive(
    { restored, serviceManager: { events } }: JupyterFrontEnd,
    provider: IMetrics.Provider
  ) {
    await restored;
    for await (const event of events.stream) {
      if (event.schema_id === IMetrics.Event.Command.SCHEMA) {
        console.log('emission!', event);
        void provider.collect(event);
      }
    }
  }
}
