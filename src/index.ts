import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Token } from '@lumino/coreutils';

const COMMAND_EVENT_VERSION = '1';
const COMMAND_EVENT = `https://quantstack.net/schema/metrics/command/v${COMMAND_EVENT_VERSION}`;

export const IMetricsProvider = new Token('@quantstack/metrics:provider');

export interface IMetricsProvider {
  collect: (event: any) => Promise<void>;
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: '@quantstack/metrics:plugin',
  description: 'An extension for metrics',
  autoStart: true,
  requires: [IMetricsProvider],
  optional: [ISettingRegistry],
  activate: async (
    app: JupyterFrontEnd,
    provider: IMetricsProvider,
    registry: ISettingRegistry | null
  ) => {
    try {
      if (registry) {
        const settings = await registry.load(plugin.id);
        console.log(`${plugin.id} settings loaded:`, settings.composite);
      }
    } catch (error) {
      console.error(`Failed to load ${plugin.id} settings.`, error);
    }
    void Private.broadcastEmissions(app);
    void Private.handleEmissions(app, provider);
  }
};

const provider: JupyterFrontEndPlugin<IMetricsProvider> = {
  id: '@quantstack/metrics:provider',
  description: 'A provider for metrics',
  provides: IMetricsProvider,
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
        schema_id: COMMAND_EVENT,
        data: { metrics: { command: id, args: args as unknown as any } },
        version: COMMAND_EVENT_VERSION
      });
    });
  }

  export async function handleEmissions(
    { serviceManager: { events } }: JupyterFrontEnd,
    provider: IMetricsProvider
  ) {
    for await (const event of events.stream) {
      if (event.schema_id === COMMAND_EVENT) {
        console.log('emission!', event);
        void provider.collect(event);
      }
    }
  }
}
