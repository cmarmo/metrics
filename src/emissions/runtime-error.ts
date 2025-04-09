import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { IMetrics } from '../metrics';

/**
 * The runtime error metrics type.
 */
export type RuntimeError = { type: string; description: string };

/**
 * A namespace for runtime error metrics.
 */
export namespace RuntimeError {
  /**
   * The event schema version.
   */
  export const VERSION = '1';

  /**
   * The event schema URL.
   */
  export const SCHEMA = `https://schema.notebook.link/metrics/runtime-error/v${VERSION}`;

  /**
   * Listens for window error/unhandledrejection events and broadcasts them.
   * @param emitter - An event emitter, e.g. JupyterLab's event manager.
   * @returns a disposable that stops broadcasting when disposed.
   */
  export function broadcast(emitter: IMetrics.Event.Emitter): IDisposable {
    const errorHandler = (error: ErrorEvent) => {
      const data: IMetrics.Event<RuntimeError> = {
        level: { anonymous: false, sensitivity: 'high' },
        metrics: { description: error.message, type: 'window-level error' },
        timestamp: new Date().toISOString()
      };
      void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
    };
    const rejectionHandler = (error: PromiseRejectionEvent) => {
      const data: IMetrics.Event<RuntimeError> = {
        level: { anonymous: false, sensitivity: 'high' },
        metrics: {
          description: error.reason.message ?? 'onunhandledrejection',
          type: 'window-level unhandled rejection'
        },
        timestamp: new Date().toISOString()
      };
      void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
    };
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
    return new DisposableDelegate(() => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    });
  }
}
