import { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { Event as JupyterEvent } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  DisposableDelegate,
  DisposableSet,
  IDisposable
} from '@lumino/disposable';
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
          Private.dispatch(events.stream, collector, settings),
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

namespace Private {
  type Event = IMetrics.Event;

  export function dispatch(
    stream: JupyterEvent.Stream,
    collector: IMetrics.ICollector,
    settings: ISettingRegistry.ISettings
  ): IDisposable {
    let stopped = false;
    const guard: Event['level'] = { anonymous: true, sensitivity: 'low' };
    const allowed = ({ level }: Event): boolean => {
      if (guard.anonymous && !level.anonymous) {
        return false;
      }
      if (guard.sensitivity === 'low' && level.sensitivity !== 'low') {
        return false;
      }
      if (guard.sensitivity === 'moderate' && level.sensitivity === 'high') {
        return false;
      }
      return true;
    };
    const update = (settings: ISettingRegistry.ISettings) => {
      const anonymous = settings.get('anonymous').composite;
      const sensitivity = settings.get('sensitivity').composite;
      guard.anonymous = anonymous as Event['level']['anonymous'];
      guard.sensitivity = sensitivity as Event['level']['sensitivity'];
    };
    update(settings);
    settings.changed.connect(update);
    void (async () => {
      for await (const event of stream) {
        if (stopped) {
          return;
        }
        const { schema_id } = event;
        switch (schema_id) {
          case IMetrics.Event.CommandExecuted.SCHEMA:
          case IMetrics.Event.CurrentChanged.SCHEMA:
          case IMetrics.Event.RuntimeError.SCHEMA:
            if (allowed(event as unknown as Event)) {
              void collector.collect(schema_id, event as unknown as Event);
            }
            break;
          default:
            continue;
        }
      }
    })();
    return new DisposableDelegate(() => {
      stopped = true;
      settings.changed.disconnect(update);
    });
  }
}
