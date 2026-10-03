const fs = require('fs');
const file = 'app/routes/_index/route.jsx';
let content = fs.readFileSync(file, 'utf8');

// We want to redirect to /app if there is an id_token or host or shop.
// Actually, let's just redirect to /app always. If it fails authentication, remix will handle it.
// But wait, the standard template has the form on the index page for non-embedded login.
// Let's redirect to /app if shop, host, or id_token is present.

content = content.replace(
    'if (url.searchParams.get("shop")) {',
    'if (url.searchParams.get("shop") || url.searchParams.get("host") || url.searchParams.get("id_token")) {'
);

fs.writeFileSync(file, content);
console.log("Patched route.jsx");
