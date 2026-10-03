const fs = require('fs');
const file = 'app/entry.server.jsx';
let content = fs.readFileSync(file, 'utf8');

const patchCode = `
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
`;

if (!content.includes('client.crisp.chat')) {
    content = content.replace('  addDocumentResponseHeaders(request, responseHeaders);', patchCode);
    fs.writeFileSync(file, content);
    console.log("Patched CSP successfully");
} else {
    console.log("Already patched");
}
