const fs = require('fs');
const file = 'app/routes/_index/route.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace the entire loader to unconditionally redirect to /app, preserving search parameters.
content = content.replace(
    /export const loader = async \(\{ request \}\) => \{[\s\S]*?return \{ showForm: Boolean\(login\) \};\n\};/,
    `export const loader = async ({ request }) => {
  const url = new URL(request.url);
  
  if (url.searchParams.toString()) {
    throw redirect(\`/app?\${url.searchParams.toString()}\`);
  }

  throw redirect("/app");
};`
);

fs.writeFileSync(file, content);
console.log("Patched loader");
