import { eventEmitter } from '../emitter';
import { SendOptions, Listener, SocketAddress } from '../types';
import { native, noop, DEFAULT_PAYLOAD_LIMIT, OPCODE_PING, OPCODE_BINARY, OPCODE_TEXT } from './shared';
import * as HTTP from 'http';

native.setNoop(noop);

const clientGroup: any = native.client.group.create(0, DEFAULT_PAYLOAD_LIMIT);

native.client.group.onConnection(clientGroup, (newExternal: any): void => {
  const webSocket: WebSocket = native.getUserData(newExternal);
  webSocket.external = newExternal;
  webSocket.emit('open');
});

native.client.group.onMessage(clientGroup, (message: string | Buffer, webSocket: WebSocket): void => {
  webSocket.emit('message', message);
});

native.client.group.onPing(clientGroup, (message: string | Buffer, webSocket: WebSocket): void => {
  webSocket.emit('ping', message);
});

native.client.group.onPong(clientGroup, (message: string | Buffer, webSocket: WebSocket): void => {
  webSocket.emit('pong', message);
});

native.client.group.onError(clientGroup, (webSocket: WebSocket): void => {
  process.nextTick((): void => {
    webSocket.emit('error', {
      message: 'cWs client connection error',
      stack: 'cWs client connection error'
    });
  });
});

native.client.group.onDisconnection(clientGroup, (newExternal: any, code: number, message: any, webSocket: WebSocket): void => {
  webSocket.external = null;
  process.nextTick((): void => {
    if (!code) {
      // if no code provided it is 100% error in parsing or in code
      webSocket.emit('error', {
        message: 'cWs invalid status code or invalid UTF-8 sequence',
        stack: 'cWs invalid status code or invalid UTF-8 sequence'
      });

      webSocket.emit('close', 1006, '');
      return webSocket = null;
    }
    webSocket.emit('close', code, message);
    webSocket = null;
  });
  native.clearUserData(newExternal);
});

// get event emitter instance
export const EventEmitterClient: any = eventEmitter();

type NewUpgradeReq = HTTP.IncomingMessage & SocketAddress;

export class WebSocket extends EventEmitterClient {
  public OPEN: number = 1;
  public CLOSED: number = 0;

  public external: any = noop;
  public executeOn: string;
  private _upgradeReq: HTTP.IncomingMessage & SocketAddress;

  constructor(url: string, upgradeReq: HTTP.IncomingMessage, external?: any, isServer?: boolean) {
    super();
    this.external = external;
    const address: SocketAddress = this._socket;
    (upgradeReq as NewUpgradeReq).remoteAddress = address.remoteAddress;
    (upgradeReq as NewUpgradeReq).remoteFamily = address.remoteFamily;
    (upgradeReq as NewUpgradeReq).remotePort = address.remotePort;
    this._upgradeReq = (upgradeReq as NewUpgradeReq);
    this.executeOn = isServer ? 'server' : 'client';

    if (!isServer) {
      native.connect(clientGroup, url, this);
    }
  }

  get upgradeReq(): HTTP.IncomingMessage {
    return this._upgradeReq;
  }

  public get _socket(): SocketAddress {
    const address: any[] = this.external ? native.getAddress(this.external) : new Array(3);
    return {
      remotePort: address[0],
      remoteAddress: address[1],
      remoteFamily: address[2]
    };
  }

  public get remoteAddress(): string {
    const address: any[] = this.external ? native.getAddress(this.external) : new Array(3);
    return address[1];
  }

  public get readyState(): number {
    return this.external ? this.OPEN : this.CLOSED;
  }

  // browser interface
  public set onopen(listener: Listener) {
    this.on('open', listener);
  }

  public set onclose(listener: Listener) {
    this.on('close', listener);
  }

  public set onerror(listener: Listener) {
    this.on('error', listener);
  }

  public set onmessage(listener: Listener) {
    this.on('message', listener);
  }

  // overload on function from super class
  public on(event: string, listener: Listener): void;
  public on(event: 'open', listener: () => {}): void;
  public on(event: 'error', listener: (err: Error) => void): void;
  public on(event: 'message', listener: (message: string | any[]) => void): void;
  public on(event: 'close', listener: (code?: number, reason?: string) => void): void;
  public on(event: string, listener: Listener): void {
    super.on(event, listener);
  }

  public ping(message?: string | Buffer): void {
    if (!this.external) return;
    native[this.executeOn].send(this.external, message, OPCODE_PING);
  }

  public send(message: string | Buffer, options?: SendOptions, cb?: Listener): void {
    if (!this.external) return cb && cb(new Error('Not opened'));
    const useTextOpcode: boolean = options && options.binary === false || typeof message === 'string';
    const opCode: number = useTextOpcode ? OPCODE_TEXT : OPCODE_BINARY;
    native[this.executeOn].send(this.external, message, opCode, cb ? (): void => process.nextTick(cb) : null, options && options.compress);
  }

  public terminate(): void {
    if (!this.external) return;
    native[this.executeOn].terminate(this.external);
    this.external = null;
  }

  public close(code: number = 1000, reason?: string): void {
    if (!this.external) return;
    native[this.executeOn].close(this.external, code, reason);
    this.external = null;
  }
}
