import { NotebookActions } from '@jupyterlab/notebook';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { IMetrics } from '..';

type ExecutionResult = {
  success: boolean;
  error?: {
    errorName: string;
    errorValue: string;
    traceback: string[];
  } | null;
};

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

  /**
   * Broadcasts when notebook cell execution fails with a Jupyter error.
   * @param emitter - An event emitter, e.g. JupyterLab's event manager.
   * @returns a disposable that stops broadcasting when disposed.
   */
  export function broadcast(emitter: IMetrics.Event.Emitter): IDisposable {
    const handler = (_: unknown, { error, success }: ExecutionResult) => {
      if (success || !error) {
        return;
      }

      const data: IMetrics.Event<JupyterError> = {
        level: { anonymous: false, sensitivity: 'high' },
        metrics: {
          output_type: 'error',
          ename: error.errorName,
          evalue: error.errorValue,
          traceback: error.traceback
        },
        timestamp: new Date().toISOString()
      };
      void emitter.emit({ data, schema_id: SCHEMA, version: VERSION });
    };

    NotebookActions.executed.connect(handler);
    return new DisposableDelegate(() => {
      NotebookActions.executed.disconnect(handler);
    });
  }
}
