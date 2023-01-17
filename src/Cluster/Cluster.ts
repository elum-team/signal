import { createConnection, Socket } from "node:net";

import { SignalMaster } from "../Master/Master";

export type SignalCluster = {
  "ONLINE": [{}, {}];
  "DISCONNECT": [{}, {}];
  "ERROR": [{}, {}];
  "EXIT": [{}, {}];
  "LISTENING": [{}, {}];
};

type TOptConnect = {
  port: number,
  host: string,
  subdomain: string
}

type TCallbackCluster<
  C extends SignalMaster,
  T extends Record<string, Array<Record<string, any>>> = C> =
  <K extends keyof T, V extends T[K]>(type: K, value: V[0], reply?: <VALUE extends V[1]>(value: VALUE) => void) => void;

type TEventsCluster<T extends SignalMaster> = (callback: TCallbackCluster<T>) => void;

class Cluster<
  M extends SignalMaster,
  C extends SignalCluster,
  CT extends Record<string, Array<Record<string, any>>> = C
> {

  private client: Socket;
  private count: number = 0;
  private callback: Record<number, (value?: any | PromiseLike<any>) => void> = {};

  private callbackEvents: TCallbackCluster<M>;
  private bodyMaster: (cluster: Cluster<M, C, CT>, events: TEventsCluster<M>) => void;

  constructor(callback: (
    cluster: Cluster<M, C, CT>,
    events: TEventsCluster<M>
  ) => void) {
    this.bodyMaster = callback;
  }

  public connect = (opt: TOptConnect) => {
    const { port, host, subdomain } = opt;
    this.init(port, host);
    this.bodyMaster(this, this.events);
  }

  public events: TEventsCluster<M> = (callback) => this.callbackEvents = callback;

  public init = (port: number, host: string) => {
    const client = createConnection({ port: port, host: host });
    client.on("end", () => { });
    client.on("connect", () => { console.log("connected") });
    client.on("data", (data) => {
      const { type, value, requestId } = JSON.parse(data.toString());
      const reply = (requestId: number) => (value: any) => {
        const message = JSON.stringify({ value, requestId });
        client.write(message);
      }
      if (!type && requestId && this.callback[requestId]) {
        this.callback[requestId](value);
        delete this.callback[requestId]; return;
      } else { this.callbackEvents(type, value, reply(requestId)) }
    });
    this.client = client;
  };

  public send<K extends keyof CT, V extends CT[K]>(type: K, value: V[0]): Promise<V[1]>
  public send<K extends keyof CT, V extends CT[K]>(type: K, value: V[0], callback: (data: V[1]) => void): void
  public send<K extends keyof CT, V extends CT[K]>(type: K, value: V[0], callback?: (data: V[1]) => void): void | Promise<V[1]> {
    if (!callback) {
      return new Promise((resolve) => {
        const requestId = ++this.count;
        this.callback[requestId] = resolve;
        const message = JSON.stringify({ type, value, requestId });
        this.client.write(message);
      });
    } else {
      const requestId = ++this.count;
      this.callback[requestId] = callback;
      const message = JSON.stringify({ type, value, requestId });
      this.client.write(message);
    }
  }

}

export default Cluster;