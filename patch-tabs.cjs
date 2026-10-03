const fs = require('fs');
const file = 'app/routes/app.widget-customization.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'const [selectedTab, setSelectedTab] = useState("global");',
    'const [selectedTab, setSelectedTab] = useState(0);'
);

content = content.replace(
    'return (',
    'const currentTabId = tabs[selectedTab]?.id;\n    return ('
);

content = content.replace(/selectedTab === "global"/g, 'currentTabId === "global"');
content = content.replace(/selectedTab === id/g, 'currentTabId === id');
content = content.replace(/selectedTab === "css"/g, 'currentTabId === "css"');
content = content.replace(/selectedTab === "preview"/g, 'currentTabId === "preview"');

fs.writeFileSync(file, content);
console.log("Patched tabs successfully");
