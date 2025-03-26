import { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { DisposableSet, IDisposable } from '@lumino/disposable';
import { IMetrics } from './metrics';

const collector: JupyterFrontEndPlugin<IMetrics.ICollector> = {
  id: IMetrics.COLLECTOR,
  description: 'A no-op collector for metrics emissions',
  provides: IMetrics.ICollector,
  activate: (): IMetrics.ICollector => ({ collect: async () => undefined })
};

const emitter: JupyterFrontEndPlugin<void> = {
  id: IMetrics.EMITTER,
  description: 'An extension that emits and collects metrics',
  autoStart: true,
  requires: [IMetrics.ICollector, ISettingRegistry],
  ...((set: IDisposable | null = null) => ({
    activate: (
      { commands, restored, serviceManager: { events }, shell },
      collector: IMetrics.ICollector,
      registry: ISettingRegistry
    ) => {
      void restored.then(async () => {
        const settings = await registry.load(IMetrics.EMITTER);
        set = DisposableSet.from([
          IMetrics.dispatch(events.stream, collector, settings),
          IMetrics.Event.CommandExecuted.broadcast(events, commands),
          IMetrics.Event.CurrentChanged.broadcast(events, shell),
          IMetrics.Event.RuntimeError.broadcast(events)
        ]);
      });
    },
    deactivate: () => set?.dispose()
  }))()
};

export default [collector, emitter];
