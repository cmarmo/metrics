import { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { PageConfig } from '@jupyterlab/coreutils';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { Event as JupyterEvent } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
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
  ...((set: DisposableSet | null = null) => ({
    activate: (
      { commands, serviceManager: { events }, shell },
      collector: IMetrics.ICollector,
      rendermimes: IRenderMimeRegistry,
      registry: ISettingRegistry
    ) => {
      (async () => {
        const emitter: IMetrics.IEmitter = {
          emit: event => events.emit(event).catch(() => undefined)
        };
        const settings = registry.load(IMetrics.EMITTER);
        set = DisposableSet.from([
          IMetrics.Event.CommandExecuted.broadcast(emitter, commands),
          IMetrics.Event.CurrentChanged.broadcast(emitter, shell),
          IMetrics.Event.JupyterError.broadcast(emitter, rendermimes),
          IMetrics.Event.RuntimeError.broadcast(emitter),
          Private.dispatch(events.stream, collector, await settings)
        ]);
      })();
    },
    deactivate: () => set?.dispose()
  }))()
};

export * from './metrics';
export default [collector, emitter];

namespace Private {
  type Event = IMetrics.Event;

  type Filter = IMetrics.Filter;

  type Sensitivity = IMetrics.Event.Sensitivity;

  type Settings = ISettingRegistry.ISettings;

  const allowed = (filter: Filter, { level }: Event) => {
    const { anonymous, sensitivity } = level;
    const enabled = !filter.disabled;
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
      const { schema_id } = event;
      switch (schema_id) {
        case IMetrics.Event.CommandExecuted.SCHEMA:
        case IMetrics.Event.CurrentChanged.SCHEMA:
        case IMetrics.Event.JupyterError.SCHEMA:
        case IMetrics.Event.RuntimeError.SCHEMA:
          if (allowed(filter, event as unknown as Event)) {
            void collector.collect(schema_id, event as unknown as Event);
          }
          break;
        default:
          continue;
      }
    }
  };

  const update = (settings: Settings, filter: Filter) => {
    const anonymous = settings.get('anonymous').composite as boolean;
    const disabled = settings.get('disabled').composite as boolean;
    const sensitivity = settings.get('sensitivity').composite as Sensitivity;
    const raw = PageConfig.getOption('notebook_link_metrics');
    console.log('raw', raw);
    const config: Partial<Filter> = JSON.parse(raw || '{}');
    filter.anonymous = config.anonymous ?? anonymous;
    filter.disabled = config.disabled ?? disabled;
    filter.sensitivity = config.sensitivity ?? sensitivity;
  };

  export function dispatch(
    stream: JupyterEvent.Stream,
    collector: IMetrics.ICollector,
    settings: Settings,
    filter: Filter = { anonymous: true, disabled: false, sensitivity: 'low' }
  ) {
    const handler = (settings: Settings) => update(settings, filter);
    update(settings, filter);
    settings.changed.connect(handler);
    void proxy(stream, collector, filter);
    return new DisposableDelegate(() => {
      filter.disabled = true;
      settings.changed.disconnect(handler);
    });
  }
}
