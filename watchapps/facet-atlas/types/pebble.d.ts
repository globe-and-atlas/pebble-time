// Ambient declaration for the PebbleKit JS global, for `make typecheck`.
declare var Pebble: {
  addEventListener(event: string, cb: (e: any) => void): void;
  sendAppMessage(dict: object, ack?: (e: any) => void, nack?: (e: any) => void): number;
  openURL(url: string): void;
};
