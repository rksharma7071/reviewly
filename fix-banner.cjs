const fs = require('fs');
const file = 'app/routes/app.widget-customization.jsx';
let content = fs.readFileSync(file, 'utf8');

const bannerHtml = `
                    <Banner title="App Embed Activation" tone="info">
                        <p>
                            To display the widgets correctly across all pages, make sure the <strong>Reviewly App Embed</strong> is enabled in your Shopify Theme Editor.
                        </p>
                        <br/>
                        <Button
                            url={\`https://\${shop}/admin/themes/current/editor?context=apps\`}
                            target="_blank"
                            external
                        >
                            Open Theme Editor
                        </Button>
                    </Banner>
`;

// Remove the wrongly injected banner
content = content.replace(bannerHtml, '');

// Now inject it right above the <Tabs> in WidgetCustomizationPage
content = content.replace(
    '<Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>',
    bannerHtml + '\n\n            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>'
);

fs.writeFileSync(file, content);
console.log("Fixed banner location");
