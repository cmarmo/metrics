import { JSONObject, Token } from '@lumino/coreutils';

export namespace IMetrics {
  export namespace Event {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface CurrentChanged {
      type: string;
    }

    export namespace CurrentChanged {
      export const VERSION = '1';

      export const SCHEMA = `https://quantstack.net/schema/metrics/current-changed/v${VERSION}`;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface CommandExecuted {
      label?: string;

      command: string;

      args?: JSONObject;
    }

    export namespace CommandExecuted {
      export const VERSION = '1';

      export const SCHEMA = `https://quantstack.net/schema/metrics/command-executed/v${VERSION}`;
    }
  }

  export const Provider = new Token('@quantstack/metrics:provider');

  // eslint-disable-next-line @typescript-eslint/naming-convention
  export interface Provider {
    collect: (
      schema: string,
      event: IMetrics.Event.CommandExecuted | IMetrics.Event.CurrentChanged
    ) => Promise<void>;
  }
}
