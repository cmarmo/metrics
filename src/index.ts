import { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { DisposableSet, IDisposable } from '@lumino/disposable';
import { IMetrics } from './metrics';

const collector: JupyterFrontEndPlugin<IMetrics.ICollector> = {
  id: '@quantstack/metrics:collector',
  description: 'A collector for metrics emissions',
  provides: IMetrics.ICollector,
  activate: () => ({ collect: async () => undefined })
};

const emitter: JupyterFrontEndPlugin<void> = {
  id: '@quantstack/metrics:emitter',
  description: 'An extension that emits metrics events',
  autoStart: true,
  requires: [IMetrics.ICollector],
  ...((set?: IDisposable) => ({
    activate: (
      { commands, restored, serviceManager: { events }, shell },
      collector: IMetrics.ICollector
    ) => {
      void restored.then(() => {
        set = DisposableSet.from([
          IMetrics.dispatch(events, collector),
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
