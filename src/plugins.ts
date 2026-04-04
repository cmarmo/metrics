import type { JupyterFrontEndPlugin } from '@jupyterlab/application';
import { PageConfig } from '@jupyterlab/coreutils';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import type { Event as JupyterEvent } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PromiseDelegate } from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { IMetrics } from '.';

export const broadcasts: JupyterFrontEndPlugin<void> = {
  id: '@notebook-link/metrics:broadcasts',
  description: 'An extension that broadcasts default metrics',
  requires: [IMetrics.IDispatcher, IRenderMimeRegistry],
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

export const collector: JupyterFrontEndPlugin<IMetrics.ICollector> = {
  id: IMetrics.COLLECTOR,
  description: 'A no-op collector for metrics emissions',
  provides: IMetrics.ICollector,
  activate: () => ({ collect: async () => undefined })
};

export const dispatcher: JupyterFrontEndPlugin<IMetrics.IDispatcher> = {
  id: IMetrics.DISPATCHER,
  description: 'An extension that dispatches registered metrics to a collector',
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
      const { stream } = events;
      const registrar = new Map<string, IDisposable | null>();
      const settings = await registry.load(IMetrics.DISPATCHER);
      const dispatcher = dispatch({ collector, registrar, settings, stream });
      const delegate = new DisposableDelegate(() => {
        for (const schema of registrar.keys()) {
          const registration = registrar.get(schema);
          registrar.delete(schema);
          registration?.dispose();
        }
        dispatcher.dispose();
      });
      const emitter: IMetrics.Event.Emitter = {
        emit: event => events.emit(event).catch(() => undefined)
      };
      activated.resolve(delegate);
      return {
        register: (schema, source) => {
          if (!delegate.isDisposed && !registrar.has(schema)) {
            registrar.set(schema, source?.(emitter) || null);
          }
        }
      };
    },
    deactivate: async () => (await activated.promise).dispose()
  }))(new PromiseDelegate())
};

namespace Private {
  type Event = IMetrics.Event<unknown>;
  type Filter = IMetrics.Filter & { disposed: boolean };
  type Override = Partial<IMetrics.Filter>;
  type Settings = ISettingRegistry.ISettings<Override>;

  const check = (event: JupyterEvent.Emission, filter: Filter) => {
    const { anonymous, sensitivity } = (event as unknown as Event).level;
    const url = event.schema_id;
    const enabled = !filter.disabled && !filter.excluded[url];
    const value = { low: 1, moderate: 2, high: 3 };
    const safe = value[sensitivity] <= value[filter.sensitivity];
    const discreet = anonymous || !filter.anonymous;
    return enabled && safe && discreet;
  };

  const initialize = (filter: Filter, settings: Settings): IDisposable => {
    let defaults: Override;
    const excluded = { ...filter.excluded };
    try {
      defaults = JSON.parse(PageConfig.getOption('notebook_link_metrics'));
    } catch (_) {
      defaults = {};
    }
    const update = (filter: Filter, settings: Settings, override: Override) => {
      const configured = (settings.composite.excluded ??
        {}) as IMetrics.Filter['excluded'];
      const overridden = override.excluded ?? {};
      const { anonymous, disabled, sensitivity } = settings.composite;
      filter.anonymous = override.anonymous ?? anonymous!;
      filter.disabled = override.disabled ?? disabled!;
      filter.excluded = { ...excluded, ...configured, ...overridden };
      filter.sensitivity = override.sensitivity ?? sensitivity!;
    };
    const handler = (settings: Settings) => update(filter, settings, defaults);
    settings.changed.connect(handler);
    update(filter, settings, defaults);
    return new DisposableDelegate(() => {
      filter.disposed = true;
      settings.changed.disconnect(handler);
    });
  };

  const proxy = async (options: {
    collector: IMetrics.ICollector;
    filter: Filter;
    registrar: Map<string, unknown>;
    stream: JupyterEvent.Stream;
  }): Promise<void> => {
    const { collector, filter, registrar, stream } = options;
    for await (const event of stream) {
      if (filter.disposed) {
        return;
      }
      if (registrar.has(event.schema_id) && check(event, filter)) {
        void collector.collect(event.schema_id, event as unknown as Event);
      }
    }
  };

  export function dispatch(options: {
    collector: IMetrics.ICollector;
    registrar: Map<string, unknown>;
    settings: Settings;
    stream: JupyterEvent.Stream;
  }): IDisposable {
    const { collector, registrar, settings, stream } = options;
    const filter: Filter = {
      anonymous: true,
      disabled: false,
      disposed: false,
      excluded: {
        [IMetrics.Event.CommandExecuted.SCHEMA]: false,
        [IMetrics.Event.CurrentChanged.SCHEMA]: false,
        [IMetrics.Event.JupyterError.SCHEMA]: false,
        [IMetrics.Event.RuntimeError.SCHEMA]: false
      },
      sensitivity: 'low'
    };
    const dispatcher = initialize(filter, settings);
    void proxy({ collector, filter, registrar, stream });
    return dispatcher;
  }
}
