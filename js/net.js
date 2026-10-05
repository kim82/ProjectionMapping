// BroadcastChannel connects the output and controller pages in the same browser profile.
// It does not use a server or expose a network port, and supports sending files and Blobs.
export function connect(onMessage) {
  const channel = new BroadcastChannel('projection-mapper-v1');

  channel.onmessage = event => {
    if (event.data && typeof event.data === 'object') {
      onMessage(event.data);
    }
  };

  return {
    send: message => channel.postMessage(message)
  };
}
