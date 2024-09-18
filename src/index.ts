import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

const COMMAND_EVENT_VERSION = '1';
const COMMAND_EVENT = `https://quantstack.net/schema/metrics/command/v${COMMAND_EVENT_VERSION}`;

/**
 * Initialization data for the @quantstack/metrics extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@quantstack/metrics:plugin',
  description: 'An extension for metrics',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, settingRegistry: ISettingRegistry | null) => {
    console.log('JupyterLab extension @quantstack/metrics is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('@quantstack/metrics settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for @quantstack/metrics.', reason);
        });
    }
    app.commands.commandExecuted.connect((_, command) => {
      const { args, id } = command;
      app.serviceManager.events.emit({
        schema_id: COMMAND_EVENT,
        data: { metrics: { command: id, args: args as unknown as any } },
        version: COMMAND_EVENT_VERSION,
      });
    });
    void (async () => {
      for await (const event of app.serviceManager.events.stream) {
        if (event.schema_id === COMMAND_EVENT) {
          console.log('command event:', event);
        }
      }
    })();
  }
};

export default plugin;
