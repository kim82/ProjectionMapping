// Message bus between the output page and the controller page.
// BroadcastChannel is same-origin and same-browser-profile only: no server, no open port,
// nobody else on the network can listen or send. Files/Blobs can be sent directly.
export function connect(onMsg){
  const ch=new BroadcastChannel('projection-mapper-v1');
  ch.onmessage=e=>{if(e.data&&typeof e.data==='object')onMsg(e.data);};
  return {send:o=>ch.postMessage(o)};
}
