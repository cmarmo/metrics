import { IRenderMime, IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { IMetrics } from '..';

/**
 * The Jupyter error metrics type.
 */
export type JupyterError = {
  /**
   * Type of cell output.
   */
  output_type: 'error';

  /**
   * The name of the error.
   */
  ename: string;

  /**
   * The value or message of the error.
   */
  evalue: string;

  /**
   * The error's traceback.
   */
  traceback: string[];
};

/**
 * A namespace for Jupyter error metrics.
 */
export namespace JupyterError {
  /**
   * The event schema version.
   */
  export const VERSION = '1';

  /**
   * The event schema URL.
   */
  export const SCHEMA = `https://schema.notebook.link/metrics/jupyter-error/v${VERSION}`;

  const MIME_ERROR = 'application/vnd.jupyter.error';

  const MIME_STDERR = 'application/vnd.jupyter.stderr';

  /**
   * Broadcasts when a Jupyter error (`IError` from `nbformat`) is output.
   * @param emitter - An event emitter, e.g. JupyterLab's event manager.
   * @param rendermimes - A rendermime registry.
   * @returns a disposable that stops broadcasting when disposed.
   *
   * ### Notes
   * This function adds a low rank (high priority) MIME renderer factory for
   * stderr output to the given rendermime registry. It monkey-patches the
   * default MIME renderers that are instantiated by the default factory for
   * stderr output. It checks each rendered model for a bundled Jupyter error
   * and emits a metrics event if a Jupyter error is found. When disposed,
   * because there is no way to remove a MIME renderer factory from the
   * rendermime registry, the behavior of the factory is to return the same
   * renderer the default factory does and for each extant monkey-patched
   * renderer to pass through rendering to the original renderer and emit
   * nothing.
   */
  export function broadcast(
    emitter: IMetrics.Event.Emitter,
    rendermimes: IRenderMimeRegistry
  ): IDisposable {
    const original = rendermimes.getFactory(MIME_STDERR)!;
    let stopped = false;
    rendermimes.addFactory({
      ...original,
      defaultRank: 10,
      createRenderer: options => {
        const renderer = original.createRenderer(options);
        if (stopped) {
          return renderer;
        }
        const { renderModel } = renderer;
        (renderer as unknown as IRenderMime.IRenderer).renderModel = model => {
          if (!stopped && model.data[MIME_ERROR]) {
            const data: IMetrics.Event<JupyterError> = {
              level: { anonymous: false, sensitivity: 'high' },
              metrics: model.data[MIME_ERROR] as JupyterError,
              timestamp: new Date().toISOString()
            };
            void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
          }
          return renderModel.call(renderer, model);
        };
        return renderer;
      }
    });
    return new DisposableDelegate(() => void (stopped = true));
  }
}
