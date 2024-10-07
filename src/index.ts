import { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { DisposableSet, IDisposable } from '@lumino/disposable';
import { IMetrics } from './metrics';

const collector: JupyterFrontEndPlugin<IMetrics.Collector> = {
  id: '@quantstack/metrics:collector',
  description: 'A collector for metrics emissions',
  provides: IMetrics.Collector,
  activate: () => {
    console.warn(`${collector.id} should be replaced, it is a no-op`);
    return { collect: async () => undefined };
  }
};

const emitter: JupyterFrontEndPlugin<void> = {
  id: '@quantstack/metrics:emitter',
  description: 'An extension that emits metrics events',
  autoStart: true,
  requires: [IMetrics.Collector],
  ...((set?: IDisposable) => ({
    activate: (app, collector: IMetrics.Collector) => {
      set = DisposableSet.from([
        IMetrics.Event.CommandExecuted.broadcast(app),
        IMetrics.Event.CurrentChanged.broadcast(app),
        IMetrics.Event.RuntimeError.broadcast(app),
        IMetrics.Event.dispatch(app, collector)
      ]);
    },
    deactivate: () => set?.dispose()
  }))()
};

export default [collector, emitter];
