import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IMetrics } from './metrics';

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
    void Private.broadcastEmissions(app);
    void Private.handleEmissions(app, provider);
  }
};

const provider: JupyterFrontEndPlugin<IMetrics.Provider> = {
  id: '@quantstack/metrics:provider',
  description: 'A provider for metrics',
  provides: IMetrics.Provider,
  activate: () => ({ collect: async () => undefined })
};

export default [plugin, provider];

namespace Private {
  export async function broadcastEmissions({
    commands,
    serviceManager: { events }
  }: JupyterFrontEnd) {
    commands.commandExecuted.connect((_, { args, id }) => {
      events.emit({
        schema_id: IMetrics.Event.Command.SCHEMA,
        data: { metrics: { command: id, args: args as unknown as any } },
        version: IMetrics.Event.Command.VERSION
      });
    });
  }

  export async function handleEmissions(
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
