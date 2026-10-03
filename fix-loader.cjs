const fs = require('fs');
const file = 'app/routes/app.widget-customization.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'customCss: config.customCss || "",\n        shop\n        },\n    };',
    'customCss: config.customCss || "",\n        },\n        shop,\n    };'
);

fs.writeFileSync(file, content);
console.log("Fixed loader return object");
