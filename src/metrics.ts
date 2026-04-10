import type { Event as JupyterEvent } from '@jupyterlab/services';
import { Token } from '@lumino/coreutils';
import type { IDisposable } from '@lumino/disposable';
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
  export const COLLECTOR = 'notebook-metrics:collector';

  /**
   * ID of the dispatcher plugin.
   */
  export const DISPATCHER = 'notebook-metrics:dispatcher';

  /**
   * Token for requiring/providing a collector plugin.
   */
  export const ICollector = new Token<ICollector>(COLLECTOR);

  /**
   * The API of a collector plugin.
   */
  export interface ICollector {
    collect: (schema: string, event: Event<any>) => Promise<void>;
  }

  /**
   * Token for the dispatcher plugin.
   */
  export const IDispatcher = new Token<IDispatcher>(DISPATCHER);

  /**
   * The API of the metrics emission dispatcher plugin.
   */
  export interface IDispatcher {
    /**
     * Registers a broadcast source that emits metrics events for dispatch.
     * @param schema - The event schema URL.
     * @param source - An event broadcast source, returns a clean up disposable.
     *
     * #### Notes
     * In cases where no broadcast is necessary (e.g., where a UI component
     * automatically emits metrics events), then `source` can be omitted.
     */
    register: (
      schema: string,
      source?: (emitter: Event.Emitter) => IDisposable
    ) => void;
  }

  /**
   * A generic metrics event.
   * @typeparam T - The type of the metrics payload of the event.
   */
  export type Event<T> = {
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
    excluded: { [schema: string]: boolean };
  };
}
