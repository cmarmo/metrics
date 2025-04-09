import { Event as JupyterEvent } from '@jupyterlab/services';
import { Token } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { CommandExecuted as CE_IMPORT } from './emissions/command-executed';
import { CurrentChanged as CC_IMPORT } from './emissions/current-changed';
import { JupyterError as JP_IMPORT } from './emissions/jupyter-error';
import { RuntimeError as RE_IMPORT } from './emissions/runtime-error';

/**
 * The namespace for the metrics extension.
 */
export namespace IMetrics {
  /**
   * ID of the collector plugin.
   */
  export const COLLECTOR = '@notebook-link/metrics:collector';

  /**
   * ID of the emitter plugin.
   */
  export const EMITTER = '@notebook-link/metrics:emitter';

  /**
   * Token for requiring/providing a collector plugin.
   */
  export const ICollector = new Token<ICollector>(COLLECTOR);

  /**
   * Token for the emitter plugin.
   */
  export const IEmitter = new Token<IEmitter>(EMITTER);

  /**
   * The API of a collector plugin.
   */
  export interface ICollector {
    collect: (schema: string, event: Event) => Promise<void>;
  }

  /**
   * The API of the emitter plugin.
   */
  export interface IEmitter {
    /**
     * Registers a broadcast source that emits metrics events.
     * @param schema - The event schema URL.
     * @param broadcast - An event broadcaster, returns a clean up disposable.
     */
    register: (
      schema: string,
      broadcast: (emitter: Event.Emitter) => IDisposable
    ) => void;
  }

  /**
   * A generic metrics event.
   * @typeparam T - The type of the metrics payload of the event.
   */
  export type Event<
    T = Event.CommandExecuted | Event.CurrentChanged | Event.RuntimeError
  > = {
    /**
     * The sensitivity / anonymity level of an event.
     */
    level: Event.Level;

    /**
     * The metrics payload.
     */
    metrics: T;

    /**
     * The event timestamp as a string in ISO format.
     */
    timestamp: string;
  };

  /**
   * The metrics event namespace.
   */
  export namespace Event {
    /**
     * A minimal emitter of metrics events,
     * (compatible with e.g., Event.IManager from @jupyterlab/services).
     */
    export type Emitter = { emit(event: JupyterEvent.Request): Promise<void> };

    /**
     * Whether the metrics data is anonymous and how sensitive it is.
     */
    export type Level = { anonymous: boolean; sensitivity: Sensitivity };

    /**
     * Event metrics data sensitivity.
     */
    export type Sensitivity = 'high' | 'moderate' | 'low';

    /**
     * Metrics emission type.
     */
    export type Type =
      | 'command-executed'
      | 'current-changed'
      | 'jupyter-error'
      | 'runtime-error';

    /**
     * A utility function that returns the event type of a known schema URL.
     * @param url - The schema ID of an emission
     * @returns the event type.
     */
    export const type = (url: string) => url.split('/').reverse()[1] as Type;

    export import CommandExecuted = CE_IMPORT;
    export import CurrentChanged = CC_IMPORT;
    export import JupyterError = JP_IMPORT;
    export import RuntimeError = RE_IMPORT;
  }

  /**
   * A filter to apply to all metrics emissions.
   */
  export type Filter = Event.Level & {
    disabled: boolean;
    excluded: { [key in Event.Type]: boolean };
  };
}
