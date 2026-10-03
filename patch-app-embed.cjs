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

if (!content.includes('App Embed Activation')) {
    content = content.replace(
        '<BlockStack gap="400">',
        `<BlockStack gap="400">
                    ${bannerHtml}`
    );
    // Add shop to loader
    content = content.replace(
        'const config = await getOrCreateConfig(session.shop);',
        'const config = await getOrCreateConfig(session.shop);\n    const shop = session.shop;'
    );
    content = content.replace(
        'customCss: config.customCss || "",',
        'customCss: config.customCss || "",\n        shop'
    );
    content = content.replace(
        'const { config } = useLoaderData();',
        'const { config, shop } = useLoaderData();'
    );
    fs.writeFileSync(file, content);
    console.log("Patched successfully");
} else {
    console.log("Already patched");
}
