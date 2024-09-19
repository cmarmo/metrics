import { Token } from '@lumino/coreutils';

export namespace IMetrics {
  export namespace Event {

    export interface Command {}

    export namespace Command {

      export const VERSION = '1';

      export const SCHEMA = `https://quantstack.net/schema/metrics/command/v${VERSION}`
    }
  }

  export const Provider = new Token('@quantstack/metrics:provider');

  export interface Provider {
    collect: (event: any) => Promise<void>;
  }
}
