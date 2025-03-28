import { JupyterFrontEnd } from '@jupyterlab/application';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { FocusTracker, Widget } from '@lumino/widgets';
import { IMetrics } from '../metrics';

/**
 * The current changed metrics type.
 */
export type CurrentChanged = { label: string };

/**
 * A namespace for current changed metrics.
 */
export namespace CurrentChanged {
  /**
   * The event schema version.
   */
  export const VERSION = '1';

  /**
   * The event schema URL.
   */
  export const SCHEMA = `https://schema.notebook.link/metrics/current-changed/v${VERSION}`;

  /**
   * Listens for (shell) current changed signals and broadcasts them.
   * @param emitter - An event emitter, e.g. JupyterLab's event manager.
   * @param shell - A Jupyter front-end application shell.
   * @returns a disposable that stops broadcasting when disposed.
   */
  export function broadcast(
    emitter: IMetrics.IEmitter,
    shell: JupyterFrontEnd.IShell
  ): IDisposable {
    const handler = (
      _: unknown,
      { newValue }: FocusTracker.IChangedArgs<Widget>
    ) => {
      if (newValue === null) {
        return;
      }
      const data: IMetrics.Event<CurrentChanged> = {
        level: { anonymous: false, sensitivity: 'high' },
        metrics: { label: newValue.title.label || newValue.title.caption },
        timestamp: new Date().toISOString()
      };
      void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
    };
    shell.currentChanged?.connect(handler);
    return new DisposableDelegate(() => {
      shell.currentChanged?.disconnect(handler);
    });
  }
}
