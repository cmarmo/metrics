import { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { PageConfig } from '@jupyterlab/coreutils';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { Event as JupyterEvent } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PromiseDelegate } from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { IMetrics } from './metrics';

const broadcasts: JupyterFrontEndPlugin<void> = {
  id: '@notebook-link/metrics:broadcasts',
  description: 'An extension that broadcasts default metrics',
  requires: [IMetrics.IDispatcher, IRenderMimeRegistry, ISettingRegistry],
  activate: (
    { commands, shell },
    { register }: IMetrics.IDispatcher,
    rendermimes: IRenderMimeRegistry
  ) => {
    register(IMetrics.Event.CommandExecuted.SCHEMA, emitter =>
      IMetrics.Event.CommandExecuted.broadcast(emitter, commands)
    );
    register(IMetrics.Event.CurrentChanged.SCHEMA, emitter =>
      IMetrics.Event.CurrentChanged.broadcast(emitter, shell)
    );
    register(IMetrics.Event.JupyterError.SCHEMA, emitter =>
      IMetrics.Event.JupyterError.broadcast(emitter, rendermimes)
    );
    register(IMetrics.Event.RuntimeError.SCHEMA, emitter =>
      IMetrics.Event.RuntimeError.broadcast(emitter)
    );
  },
  autoStart: true
};

const collector: JupyterFrontEndPlugin<IMetrics.ICollector> = {
  id: IMetrics.COLLECTOR,
  description: 'A no-op collector for metrics emissions',
  provides: IMetrics.ICollector,
  activate: () => ({ collect: async () => undefined })
};

const dispatcher: JupyterFrontEndPlugin<IMetrics.IDispatcher> = {
  id: IMetrics.DISPATCHER,
  description: 'An extension that emits and collects metrics',
  autoStart: true,
  requires: [IMetrics.ICollector, ISettingRegistry],
  provides: IMetrics.IDispatcher,
  ...((activated: PromiseDelegate<IDisposable>) => ({
    activate: async (
      { serviceManager: { events } },
      collector: IMetrics.ICollector,
      registry: ISettingRegistry
    ) => {
      const { dispatch } = Private;
      const registered: { [url: string]: IDisposable } = {};
      const settings = await registry.load(IMetrics.DISPATCHER);
      const { stream } = events;
      const dispatcher = dispatch({ collector, registered, settings, stream });
      const delegate = new DisposableDelegate(() => {
        dispatcher.dispose();
        for (const schema in registered) {
          const registration = registered[schema];
          registration.dispose();
          delete registered[schema];
        }
      });
      const emitter: IMetrics.Event.Emitter = {
        emit: event => events.emit(event).catch(() => undefined)
      };
      const register: IMetrics.IDispatcher['register'] = (schema, source) => {
        if (!delegate.isDisposed && !(schema in registered)) {
          registered[schema] = source(emitter);
        }
      };
      activated.resolve(delegate);
      return { register };
    },
    deactivate: async () => (await activated.promise).dispose()
  }))(new PromiseDelegate())
};

export * from './metrics';
export default [broadcasts, collector, dispatcher];

namespace Private {
  type Event = IMetrics.Event<unknown>;
  type Filter = IMetrics.Filter & { disposed: boolean };
  type Override = Partial<Filter>;
  type Sensitivity = IMetrics.Event.Sensitivity;
  type Settings = ISettingRegistry.ISettings;

  const allowed = (filter: Filter, event: JupyterEvent.Emission) => {
    const { anonymous, sensitivity } = (event as unknown as Event).level;
    const url = event.schema_id;
    const enabled = !filter.disabled && !filter.excluded[url];
    const value = { low: 1, moderate: 2, high: 3 };
    const safe = value[sensitivity] <= value[filter.sensitivity];
    const discreet = anonymous || !filter.anonymous;
    return enabled && safe && discreet;
  };

  const proxy = async (options: {
    collector: IMetrics.ICollector;
    filter: Filter;
    registered: { [schema: string]: unknown };
    stream: JupyterEvent.Stream;
  }): Promise<void> => {
    const { collector, filter, registered, stream } = options;
    for await (const event of stream) {
      if (filter.disposed) {
        return;
      }
      if (event.schema_id in registered && allowed(filter, event)) {
        void collector.collect(event.schema_id, event as unknown as Event);
      }
    }
  };

  const update = (filter: Filter, settings: Settings, override: Override) => {
    const anonymous = settings.get('anonymous').composite as boolean;
    const disabled = settings.get('disabled').composite as boolean;
    const sensitivity = settings.get('sensitivity').composite as Sensitivity;
    filter.anonymous = override.anonymous ?? anonymous;
    filter.disabled = override.disabled ?? disabled;
    filter.sensitivity = override.sensitivity ?? sensitivity;
  };

  export function dispatch(options: {
    collector: IMetrics.ICollector;
    registered: { [schema: string]: unknown };
    settings: Settings;
    stream: JupyterEvent.Stream;
  }): IDisposable {
    const { collector, registered, settings, stream } = options;
    const filter: Filter = {
      anonymous: true,
      disabled: false,
      disposed: false,
      sensitivity: 'low',
      excluded: {
        [IMetrics.Event.CommandExecuted.SCHEMA]: false,
        [IMetrics.Event.CurrentChanged.SCHEMA]: false,
        [IMetrics.Event.JupyterError.SCHEMA]: false,
        [IMetrics.Event.RuntimeError.SCHEMA]: false
      }
    };
    let defaults: Override = {};
    try {
      defaults = JSON.parse(PageConfig.getOption('notebook_link_metrics'));
    } catch (_) {
      defaults = {};
    }
    update(filter, settings, defaults);
    const handler = (settings: Settings) => update(filter, settings, defaults);
    settings.changed.connect(handler);
    void proxy({ collector, filter, registered, stream });
    return new DisposableDelegate(() => {
      filter.disposed = true;
      settings.changed.disconnect(handler);
    });
  }
}
