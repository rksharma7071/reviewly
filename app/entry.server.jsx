import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  reactRouterContext,
) {

  addDocumentResponseHeaders(request, responseHeaders);
  
  // Patch Content-Security-Policy to allow Crisp Chat
  let csp = responseHeaders.get("Content-Security-Policy");
  if (csp) {
    csp = csp.replace("script-src ", "script-src https://client.crisp.chat ");
    csp = csp.replace("connect-src ", "connect-src https://client.crisp.chat wss://client.crisp.chat ");
    csp = csp.replace("style-src ", "style-src https://client.crisp.chat ");
    csp = csp.replace("font-src ", "font-src https://client.crisp.chat ");
    csp = csp.replace("img-src ", "img-src https://image.crisp.chat https://client.crisp.chat ");
    csp = csp.replace("frame-src ", "frame-src https://game.crisp.chat ");
    responseHeaders.set("Content-Security-Policy", csp);
  }

  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    setTimeout(abort, streamTimeout + 1000);
  });
}
