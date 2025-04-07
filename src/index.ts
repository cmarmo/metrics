import { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { PageConfig } from '@jupyterlab/coreutils';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { Event as JupyterEvent } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PromiseDelegate } from '@lumino/coreutils';
import { DisposableDelegate, DisposableSet } from '@lumino/disposable';
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
  requires: [IMetrics.ICollector, IRenderMimeRegistry, ISettingRegistry],
  ...((set: PromiseDelegate<DisposableSet>) => ({
    activate: (
      { commands, serviceManager: { events }, shell },
      collector: IMetrics.ICollector,
      rendermimes: IRenderMimeRegistry,
      registry: ISettingRegistry
    ) => {
      void (async (emitter: IMetrics.IEmitter) => {
        const settings = await registry.load(IMetrics.EMITTER);
        set.resolve(
          DisposableSet.from([
            IMetrics.Event.CommandExecuted.broadcast(emitter, commands),
            IMetrics.Event.CurrentChanged.broadcast(emitter, shell),
            IMetrics.Event.JupyterError.broadcast(emitter, rendermimes),
            IMetrics.Event.RuntimeError.broadcast(emitter),
            Private.dispatch(events.stream, collector, settings)
          ])
        );
      })({ emit: event => events.emit(event).catch(() => undefined) });
    },
    deactivate: async () => (await set.promise).dispose()
  }))(new PromiseDelegate())
};

export * from './metrics';
export default [collector, emitter];

namespace Private {
  type Event = IMetrics.Event;

  type Filter = IMetrics.Filter & { disposed: boolean };

  type Sensitivity = IMetrics.Event.Sensitivity;

  type Settings = ISettingRegistry.ISettings;

  const DEFAULT_FILTER: Filter = {
    anonymous: true,
    disabled: false,
    disposed: false,
    sensitivity: 'low',
    excluded: {
      'command-executed': false,
      'current-changed': false,
      'jupyter-error': false,
      'runtime-error': false
    }
  };

  const allowed = (filter: Filter, event: JupyterEvent.Emission) => {
    const type = IMetrics.Event.type(event.schema_id);
    const { anonymous, sensitivity } = (event as unknown as Event).level;
    const enabled = !filter.disabled && !filter.excluded[type];
    const value = { low: 1, moderate: 2, high: 3 };
    const safe = value[sensitivity] <= value[filter.sensitivity];
    const discreet = anonymous || !filter.anonymous;
    return enabled && safe && discreet;
  };

  const proxy = async (
    stream: JupyterEvent.Stream,
    collector: IMetrics.ICollector,
    filter: Filter
  ) => {
    for await (const event of stream) {
      if (filter.disposed) {
        return;
      }
      const { schema_id } = event;
      switch (schema_id) {
        case IMetrics.Event.CommandExecuted.SCHEMA:
        case IMetrics.Event.CurrentChanged.SCHEMA:
        case IMetrics.Event.JupyterError.SCHEMA:
        case IMetrics.Event.RuntimeError.SCHEMA:
          if (allowed(filter, event)) {
            void collector.collect(schema_id, event as unknown as Event);
          }
          break;
        default:
          continue;
      }
    }
  };

  const update = (
    filter: Filter,
    settings: Settings,
    override: Partial<Filter>
  ) => {
    const anonymous = settings.get('anonymous').composite as boolean;
    const disabled = settings.get('disabled').composite as boolean;
    const sensitivity = settings.get('sensitivity').composite as Sensitivity;
    filter.anonymous = override.anonymous ?? anonymous;
    filter.disabled = override.disabled ?? disabled;
    filter.sensitivity = override.sensitivity ?? sensitivity;
  };

  export function dispatch(
    stream: JupyterEvent.Stream,
    collector: IMetrics.ICollector,
    settings: Settings
  ) {
    const filter = structuredClone(DEFAULT_FILTER);
    let defaults: Partial<Filter> = {};
    try {
      defaults = JSON.parse(PageConfig.getOption('notebook_link_metrics'));
    } catch (_) {
      defaults = {};
    }
    update(filter, settings, defaults);
    const handler = (settings: Settings) => update(filter, settings, defaults);
    settings.changed.connect(handler);
    void proxy(stream, collector, filter);
    return new DisposableDelegate(() => {
      filter.disposed = true;
      settings.changed.disconnect(handler);
    });
  }
}
