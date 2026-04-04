import { PageConfig } from '@jupyterlab/coreutils';
import { Event as JupyterEvent } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { CommandRegistry } from '@lumino/commands';
import { Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import { CommandExecuted } from '../emissions/command-executed';
import { CurrentChanged } from '../emissions/current-changed';
import { IMetrics } from '../metrics';

jest.mock('@jupyterlab/rendermime', () => ({
  IRenderMimeRegistry: Symbol('@notebook-link/metrics:test-rendermime')
}));

const { dispatcher } = jest.requireActual(
  '../plugins'
) as typeof import('../plugins');

const flush = async (count = 5) => {
  for (let index = 0; index < count; index++) {
    await Promise.resolve();
  }
};

const createEvent = (): JupyterEvent.Emission =>
  ({
    level: { anonymous: false, sensitivity: 'high' },
    metrics: { command: 'metrics:test' },
    schema_id: CommandExecuted.SCHEMA,
    timestamp: new Date().toISOString(),
    version: CommandExecuted.VERSION
  }) as unknown as JupyterEvent.Emission;

const createSettings = (composite: Partial<IMetrics.Filter>) => {
  const sender = {};
  const changed = new Signal<
    typeof sender,
    ISettingRegistry.ISettings<Partial<IMetrics.Filter>>
  >(sender);
  const settings = {
    changed,
    composite
  } as unknown as ISettingRegistry.ISettings<Partial<IMetrics.Filter>>;
  return { settings };
};

const createStream = <T>() => {
  const values: T[] = [];
  const resolvers: Array<(result: IteratorResult<T>) => void> = [];
  let done = false;

  const next = () => {
    if (values.length > 0) {
      return Promise.resolve({ value: values.shift()!, done: false });
    }
    if (done) {
      return Promise.resolve({ done: true, value: undefined as T });
    }
    return new Promise<IteratorResult<T>>(resolve => {
      resolvers.push(resolve);
    });
  };

  return {
    close: () => {
      done = true;
      for (const resolve of resolvers.splice(0)) {
        resolve({ done: true, value: undefined as T });
      }
    },
    push: (value: T) => {
      const resolve = resolvers.shift();
      if (resolve) {
        resolve({ done: false, value });
        return;
      }
      values.push(value);
    },
    stream: {
      [Symbol.asyncIterator]: () => ({ next })
    } as AsyncIterable<T>
  };
};

const activateDispatcher = async (
  collector: IMetrics.ICollector,
  settings: ISettingRegistry.ISettings<Partial<IMetrics.Filter>>,
  stream: AsyncIterable<JupyterEvent.Emission>
) => {
  const plugin = dispatcher;
  const registry = {
    load: async () => settings
  } as unknown as ISettingRegistry;
  const events = {
    emit: jest.fn().mockResolvedValue(undefined),
    stream
  };
  const app = { serviceManager: { events } };
  const api = await plugin.activate(app as never, collector, registry);
  return { api };
};

describe('@notebook-link/metrics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('broadcasts command executions as schema events', async () => {
    const emitted: JupyterEvent.Request[] = [];
    const commands = new CommandRegistry();
    commands.addCommand('metrics:test', {
      execute: () => undefined,
      label: 'Metrics Test'
    });

    const registration = CommandExecuted.broadcast(
      { emit: async event => void emitted.push(event) },
      commands
    );

    await commands.execute('metrics:test', { source: 'jest' });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      data: {
        level: { anonymous: false, sensitivity: 'high' },
        metrics: {
          args: { source: 'jest' },
          command: 'metrics:test',
          label: 'Metrics Test'
        }
      },
      schema_id: CommandExecuted.SCHEMA,
      version: CommandExecuted.VERSION
    });

    registration.dispose();
    await commands.execute('metrics:test');

    expect(emitted).toHaveLength(1);
  });

  it('ignores null current-changed notifications', () => {
    const emitted: JupyterEvent.Request[] = [];
    const sender = {};
    const currentChanged = new Signal<
      typeof sender,
      { newValue: Widget | null; oldValue: Widget | null }
    >(sender);

    const registration = CurrentChanged.broadcast(
      { emit: async event => void emitted.push(event) },
      { currentChanged } as never
    );

    currentChanged.emit({ newValue: null, oldValue: null });

    expect(emitted).toHaveLength(0);

    const widget = new Widget();
    widget.title.label = 'Notebook';
    currentChanged.emit({ newValue: widget, oldValue: null });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      data: { metrics: { label: 'Notebook' } },
      schema_id: CurrentChanged.SCHEMA
    });

    registration.dispose();
  });

  it('does not dispatch excluded schemas from settings', async () => {
    jest.spyOn(PageConfig, 'getOption').mockReturnValue('');
    const collector = { collect: jest.fn().mockResolvedValue(undefined) };
    const { settings } = createSettings({
      anonymous: false,
      disabled: false,
      excluded: { [CommandExecuted.SCHEMA]: true },
      sensitivity: 'high'
    });
    const queue = createStream<JupyterEvent.Emission>();
    const { api } = await activateDispatcher(collector, settings, queue.stream);

    api.register(CommandExecuted.SCHEMA);
    queue.push(createEvent());
    await flush(20);
    queue.close();

    expect(collector.collect).toHaveBeenCalledTimes(0);
  });

  it('lets page config overrides exclude schemas before dispatch', async () => {
    jest
      .spyOn(PageConfig, 'getOption')
      .mockReturnValue(
        JSON.stringify({ excluded: { [CommandExecuted.SCHEMA]: true } })
      );
    const collector = { collect: jest.fn().mockResolvedValue(undefined) };
    const { settings } = createSettings({
      anonymous: false,
      disabled: false,
      excluded: { [CommandExecuted.SCHEMA]: false },
      sensitivity: 'high'
    });
    const queue = createStream<JupyterEvent.Emission>();
    const { api } = await activateDispatcher(collector, settings, queue.stream);

    api.register(CommandExecuted.SCHEMA);
    queue.push(createEvent());
    await flush(20);
    queue.close();

    expect(collector.collect).toHaveBeenCalledTimes(0);
  });
});
