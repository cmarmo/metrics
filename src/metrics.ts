import { Event as JupyterEvent } from '@jupyterlab/services';
import { Token } from '@lumino/coreutils';
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
   * The public API of a collector plugin.
   */
  export interface ICollector {
    collect: (schema: string, event: Event) => Promise<void>;
  }

  /**
   * A minimal emitter of metrics events,
   * (compatible with e.g., Event.IManager from @jupyterlab/services).
   */
  export interface IEmitter {
    emit(event: JupyterEvent.Request): Promise<void>;
  }

  /**
   * A generic metrics event.
   * @typeparam T - The type of the metrics payload of the event.
   */
  export type Event<
    T = Event.CommandExecuted | Event.CurrentChanged | Event.RuntimeError
  > = {
    /**
     * Whether the metrics data is anonymous and how sensitive it is.
     */
    level: { anonymous: boolean; sensitivity: Event.Sensitivity };

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
    export type Sensitivity = 'high' | 'moderate' | 'low';

    export type Type =
      | 'command-executed'
      | 'current-changed'
      | 'jupyter-error'
      | 'runtime-error';

    export const type = (url: string) => url.split('/').reverse()[1] as Type;

    export import CommandExecuted = CE_IMPORT;
    export import CurrentChanged = CC_IMPORT;
    export import JupyterError = JP_IMPORT;
    export import RuntimeError = RE_IMPORT;
  }

  /**
   * A filter to apply to all metrics emissions.
   */
  export type Filter = Event['level'] & {
    disabled: boolean;
    excluded: { [key in Event.Type]: boolean };
  };
}
