// app/routes/app.widget-customization.jsx
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import {
    Page, Layout, Card, Tabs, BlockStack, InlineStack, Text,
    TextField, Checkbox, Select, RangeSlider, ColorPicker, Button,
    Banner, Divider, Box, Badge, Thumbnail, Toast,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
    WIDGETS, GLOBAL_DEFAULTS,
    validateWidgetSettings, validateGlobalSettings,
    validateCustomCss, CSS_MAX_LENGTH,
} from "../utils/widget-settings-shared.js";
import { getOrCreateConfig } from "../utils/widget-settings.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const config = await getOrCreateConfig(session.shop);
    const shop = session.shop;

    return {
        config: {
            global: config.global || GLOBAL_DEFAULTS,
            widgets: config.widgets || {},
            enabled: config.enabled || {},
            customCss: config.customCss || "",
        },
        shop,
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const body = await request.json();
    const { intent } = body;

    if (intent === "reset_widget") {
        const widgetId = body.widgetId;
        const def = WIDGETS[widgetId];
        if (!def) return { ok: false, error: "Unknown widget" };

        const config = await getOrCreateConfig(shop);
        const widgets = { ...(config.widgets || {}) };
        widgets[widgetId] = { ...def.settings };

        await dbWidgetUpdate(shop, { widgets });
        return { ok: true };
    }

    if (intent === "reset_css") {
        const config = await getOrCreateConfig(shop);
        await dbWidgetUpdate(shop, { customCss: "" });
        return { ok: true };
    }

    if (intent === "save") {
        // Validate CSS first
        const cssCheck = validateCustomCss(body.customCss || "");
        if (!cssCheck.ok) {
            return { ok: false, errors: cssCheck.errors };
        }

        // Validate each widget
        const widgets = {};
        const enabled = {};
        for (const [id, def] of Object.entries(WIDGETS)) {
            widgets[id] = validateWidgetSettings(id, body.widgets?.[id]);
            enabled[id] = Boolean(body.enabled?.[id] ?? def.defaultEnabled);
        }

        const global = validateGlobalSettings(body.global);

        await dbWidgetUpdate(shop, {
            global,
            widgets,
            enabled,
            customCss: body.customCss || "",
        });

        return { ok: true, savedAt: new Date().toISOString() };
    }

    return { ok: false, error: "Unknown intent" };
};

async function dbWidgetUpdate(shop, data) {
    const { default: db } = await import("../db.server");
    await db.widgetConfig.upsert({
        where: { shop },
        create: { shop, ...data },
        update: data,
    });
}

export default function WidgetCustomizationPage() {
    const { config, shop } = useLoaderData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const actionData = useActionData();
    const isSaving = navigation.state === "submitting";

    // Local state mirrors loader + user edits
    const [globalSettings, setGlobalSettings] = useState(config.global);
    const [widgetSettings, setWidgetSettings] = useState(config.widgets);
    const [enabled, setEnabled] = useState(config.enabled);
    const [customCss, setCustomCss] = useState(config.customCss);
    const [selectedTab, setSelectedTab] = useState(0);
    const [dirty, setDirty] = useState(false);
    const [toast, setToast] = useState(null);
    const [cssErrors, setCssErrors] = useState([]);
    const [previewDevice, setPreviewDevice] = useState("desktop");

    // Mark dirty on any change
    useEffect(() => {
        const hasChanges =
            JSON.stringify(globalSettings) !== JSON.stringify(config.global) ||
            JSON.stringify(widgetSettings) !== JSON.stringify(config.widgets) ||
            JSON.stringify(enabled) !== JSON.stringify(config.enabled) ||
            customCss !== config.customCss;
        setDirty(hasChanges);
    }, [globalSettings, widgetSettings, enabled, customCss, config]);

    // Handle action results
    useEffect(() => {
        if (!actionData) return;
        if (actionData.ok && actionData.savedAt) {
            setToast({ content: "Settings saved", error: false });
            setDirty(false);
            setCssErrors([]);
        } else if (actionData.ok) {
            setToast({ content: "Reset complete", error: false });
        } else if (actionData.errors) {
            setCssErrors(actionData.errors);
            setToast({ content: "Fix the CSS errors below", error: true });
        } else if (actionData.error) {
            setToast({ content: actionData.error, error: true });
        }
    }, [actionData]);

    // Live CSS validation
    useEffect(() => {
        // mirror server rules
        const check = validateCssClient(customCss);
        setCssErrors(check.errors);
    }, [customCss]);

    const tabs = useMemo(() => [
        { id: "global", content: "Global" },
        ...Object.entries(WIDGETS).map(([id, def]) => ({
            id, content: def.label,
        })),
        { id: "css", content: "Custom CSS" },
        { id: "preview", content: "Preview" },
    ], []);

    const updateWidget = (id, key, value) =>
        setWidgetSettings((prev) => ({
            ...prev,
            [id]: { ...(prev[id] || WIDGETS[id].settings), [key]: value },
        }));

    const updateGlobal = (key, value) =>
        setGlobalSettings((prev) => ({ ...prev, [key]: value }));

    const toggleEnabled = (id) =>
        setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));

    const handleSave = useCallback(() => {
        submit(
            JSON.stringify({
                intent: "save",
                global: globalSettings,
                widgets: widgetSettings,
                enabled,
                customCss,
            }),
            { method: "POST", encType: "application/json" },
        );
    }, [submit, globalSettings, widgetSettings, enabled, customCss]);

    const handleResetWidget = (id) => {
        if (!confirm(`Reset ${WIDGETS[id].label} to defaults?`)) return;
        // apply locally; user must Save to persist
        setWidgetSettings((prev) => ({ ...prev, [id]: { ...WIDGETS[id].settings } }));
        setEnabled((prev) => ({ ...prev, [id]: WIDGETS[id].defaultEnabled }));
    };

    const handleResetCss = () => {
        if (!confirm("Clear all custom CSS?")) return;
        setCustomCss("");
    };

    const currentTabId = tabs[selectedTab]?.id;
    return (
        <Page
            title="Widget Customization"
            subtitle="Control every storefront widget from one place."
            primaryAction={{
                content: "Save Changes",
                onAction: handleSave,
                loading: isSaving,
                disabled: !dirty || cssErrors.length > 0,
            }}
            secondaryActions={[
                {
                    content: dirty ? "Discard changes" : "Reload",
                    onAction: () => window.location.reload(),
                },
            ]}
        >
            {dirty && (
                <Box paddingBlockEnd="400">
                    <Banner tone="warning">
                        You have unsaved changes. Click Save Changes to apply them.
                    </Banner>
                </Box>
            )}

            {cssErrors.length > 0 && (
                <Box paddingBlockEnd="400">
                    <Banner tone="critical" title="Custom CSS has errors">
                        <ul>
                            {cssErrors.map((e, i) => (
                                <li key={i}>{e}</li>
                            ))}
                        </ul>
                    </Banner>
                </Box>
            )}

            
                    <Banner title="App Embed Activation" tone="info">
                        <p>
                            To display the widgets correctly across all pages, make sure the <strong>Reviewly App Embed</strong> is enabled in your Shopify Theme Editor.
                        </p>
                        <br/>
                        <Button
                            url={`https://${shop}/admin/themes/current/editor?context=apps`}
                            target="_blank"
                            external
                        >
                            Open Theme Editor
                        </Button>
                    </Banner>


            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <Box paddingBlockStart="400">
                    {currentTabId === "global" && (
                        <GlobalTab
                            settings={globalSettings}
                            onChange={updateGlobal}
                        />
                    )}

                    {Object.keys(WIDGETS).map((id) =>
                        currentTabId === id ? (
                            <WidgetTab
                                key={id}
                                widgetId={id}
                                settings={widgetSettings[id] || WIDGETS[id].settings}
                                enabled={enabled[id] ?? WIDGETS[id].defaultEnabled}
                                onToggleEnabled={() => toggleEnabled(id)}
                                onChange={(k, v) => updateWidget(id, k, v)}
                                onReset={() => handleResetWidget(id)}
                            />
                        ) : null,
                    )}

                    {currentTabId === "css" && (
                        <CssTab
                            css={customCss}
                            onChange={setCustomCss}
                            errors={cssErrors}
                            onReset={handleResetCss}
                        />
                    )}

                    {currentTabId === "preview" && (
                        <PreviewTab
                            device={previewDevice}
                            onDeviceChange={setPreviewDevice}
                            settings={{ global: globalSettings, widgets: widgetSettings, enabled }}
                            css={customCss}
                        />
                    )}
                </Box>
            </Tabs>

            {toast && (
                <Toast
                    content={toast.content}
                    error={toast.error}
                    onDismiss={() => setToast(null)}
                />
            )}
        </Page>
    );
}

function GlobalTab({ settings, onChange }) {
    return (
        <Layout>
            <Layout.AnnotatedSection
                title="Typography"
                description="Default font applied to every Reviewly widget."
            >
                <Card>
                    <BlockStack gap="400">
                    
                        <Select
                            label="Default font family"
                            options={[
                                { label: "Theme default", value: "inherit" },
                                { label: "Inter", value: "'Inter', sans-serif" },
                                { label: "Poppins", value: "'Poppins', sans-serif" },
                                { label: "Georgia", value: "Georgia, serif" },
                            ]}
                            value={settings.fontFamily}
                            onChange={(v) => onChange("fontFamily", v)}
                        />
                    </BlockStack>
                </Card>
            </Layout.AnnotatedSection>

            <Layout.AnnotatedSection
                title="Colors"
                description="Applied wherever a widget doesn't override its own color."
            >
                <Card>
                    <BlockStack gap="400">
                        <ColorField label="Star color" id="starColor" value={settings.starColor} onChange={onChange} />
                        <ColorField label="Empty star color" id="starEmptyColor" value={settings.starEmptyColor} onChange={onChange} />
                        <ColorField label="Text color" id="textColor" value={settings.textColor} onChange={onChange} />
                        <ColorField label="Accent color" id="accentColor" value={settings.accentColor} onChange={onChange} />
                        <ColorField label="Border color" id="borderColor" value={settings.borderColor} onChange={onChange} />
                    </BlockStack>
                </Card>
            </Layout.AnnotatedSection>

            <Layout.AnnotatedSection
                title="Spacing & container"
                description="Base radius and spacing for cards and containers."
            >
                <Card>
                    <BlockStack gap="400">
                        <RangeSlider
                            label={`Default border radius (${settings.radius}px)`}
                            min={0} max={32} step={1}
                            value={settings.radius}
                            onChange={(v) => onChange("radius", v)}
                        />
                        <RangeSlider
                            label={`Default spacing (${settings.spacing}px)`}
                            min={0} max={48} step={2}
                            value={settings.spacing}
                            onChange={(v) => onChange("spacing", v)}
                        />
                        <Select
                            label="Container width"
                            options={[
                                { label: "Full width", value: "100%" },
                                { label: "Wide (1200px)", value: "1200px" },
                                { label: "Narrow (960px)", value: "960px" },
                            ]}
                            value={settings.containerWidth}
                            onChange={(v) => onChange("containerWidth", v)}
                        />
                    </BlockStack>
                </Card>
            </Layout.AnnotatedSection>
        </Layout>
    );
}

function WidgetTab({ widgetId, settings, enabled, onToggleEnabled, onChange, onReset }) {
    const def = WIDGETS[widgetId];
    return (
        <Layout>
            <Layout.Section>
                <Card>
                    <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                            <Text as="h2" variant="headingMd">{def.label}</Text>
                            <Text as="p" tone="subdued">Widget ID: <code>{widgetId}</code></Text>
                        </BlockStack>
                        <InlineStack gap="200">
                            <Checkbox
                                label="Enabled"
                                checked={enabled}
                                onChange={onToggleEnabled}
                            />
                            <Button onClick={onReset}>Reset to defaults</Button>
                        </InlineStack>
                    </InlineStack>
                </Card>
            </Layout.Section>

            <Layout.Section>
                <Card>
                    <BlockStack gap="400">
                        {Object.entries(def.settings).map(([key, template]) => (
                            <SettingField
                                key={key}
                                fieldKey={key}
                                template={template}
                                value={settings[key]}
                                onChange={(v) => onChange(key, v)}
                            />
                        ))}
                    </BlockStack>
                </Card>
            </Layout.Section>

            <Layout.Section>
                <Banner tone="info">
                    To remove a widget that's already placed in your theme, open the
                    Shopify Theme Editor and delete the corresponding block. Disabling
                    here stops the widget from loading data and rendering.
                </Banner>
            </Layout.Section>
        </Layout>
    );
}

function SettingField({ fieldKey, template, value, onChange }) {
    const label = humanLabel(fieldKey);

    if (typeof template === "boolean") {
        return (
            <Checkbox
                label={label}
                checked={Boolean(value)}
                onChange={(v) => onChange(v)}
            />
        );
    }
    if (typeof template === "number") {
        const isColorHex = false;
        const isPercent = fieldKey === "containerWidth";
        const max = pickMax(fieldKey);
        return (
            <RangeSlider
                label={`${label} (${value})`}
                min={0}
                max={max}
                step={isPercent ? 1 : 1}
                value={value ?? 0}
                onChange={(v) => onChange(v)}
            />
        );
    }
    if (fieldKey.toLowerCase().includes("color")) {
        return (
            <ColorField label={label} id={fieldKey} value={value} onChange={(k, v) => onChange(v)} />
        );
    }
    if (fieldKey === "fontFamily") {
        return (
            <Select
                label={label}
                options={[
                    { label: "Theme default", value: "inherit" },
                    { label: "Inter", value: "'Inter', sans-serif" },
                    { label: "Poppins", value: "'Poppins', sans-serif" },
                    { label: "Georgia", value: "Georgia, serif" },
                ]}
                value={value}
                onChange={onChange}
            />
        );
    }
    if (fieldKey === "sortOrder") {
        return (
            <Select
                label={label}
                options={[
                    { label: "Most recent", value: "recent" },
                    { label: "Highest rated", value: "highest" },
                    { label: "Lowest rated", value: "lowest" },
                ]}
                value={value}
                onChange={onChange}
            />
        );
    }
    if (fieldKey === "alignment") {
        return (
            <Select
                label={label}
                options={[
                    { label: "Start", value: "inline-start" },
                    { label: "Center", value: "center" },
                    { label: "End", value: "inline-end" },
                ]}
                value={value}
                onChange={onChange}
            />
        );
    }
    if (fieldKey === "aspectRatio") {
        return (
            <Select
                label={label}
                options={[
                    { label: "Square 1:1", value: "1 / 1" },
                    { label: "Portrait 4:5", value: "4 / 5" },
                    { label: "Landscape 16:9", value: "16 / 9" },
                ]}
                value={value}
                onChange={onChange}
            />
        );
    }
    return (
        <TextField
            label={label}
            value={value ?? ""}
            onChange={onChange}
            autoComplete="off"
        />
    );
}

function ColorField({ label, value, onChange, id }) {
    const [showPicker, setShowPicker] = useState(false);
    return (
        <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center">
                <div style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: value, border: "1px solid #ddd",
                }} />
                <Text as="span">{label}</Text>
                <Button size="slim" onClick={() => setShowPicker((s) => !s)}>
                    {showPicker ? "Close" : "Edit"}
                </Button>
            </InlineStack>
            {showPicker && (
                <ColorPicker
                    color={hexToHsv(value)}
                    onChange={(hsv) => onChange(id, hsvToHex(hsv))}
                />
            )}
        </BlockStack>
    );
}

function CssTab({ css, onChange, errors, onReset }) {
    return (
        <Layout>
            <Layout.Section>
                <Card>
                    <BlockStack gap="400">
                        <InlineStack align="space-between">
                            <Text as="h2" variant="headingMd">Custom CSS</Text>
                            <Button onClick={onReset} tone="critical">Reset CSS</Button>
                        </InlineStack>

                        <Text as="p" tone="subdued">
                            Your CSS is automatically scoped to Reviewly widgets only. Selectors
                            are prefixed at save time, so <code>.my-card</code> becomes
                            <code>.reviewly-scope-reviews .my-card</code> (and equivalents for
                            other widgets). <code>@import</code>, external <code>url()</code>,
                            and inline <code>&lt;style&gt;</code>/<code>&lt;script&gt;</code>
                            are rejected.
                        </Text>

                        <TextField
                            label="CSS"
                            labelHidden
                            value={css}
                            onChange={onChange}
                            multiline={20}
                            autoComplete="off"
                            spellCheck={false}
                            monospaced
                            helpText={`${css.length} / ${CSS_MAX_LENGTH} characters`}
                            error={errors.length > 0 ? errors.join(" · ") : undefined}
                        />

                        <Banner tone="info" title="Selector examples">
                            <ul>
                                <li><code>.rw-review</code> — review card (Reviews widget)</li>
                                <li><code>.rw-review__title</code> — review title</li>
                                <li><code>.reviewly-photo-reviews__card</code> — photo card</li>
                                <li><code>.reviewly-review-carousel__card</code> — carousel card</li>
                                <li><code>.reviewly-review-carousel__arrow</code> — carousel arrow</li>
                            </ul>
                        </Banner>
                    </BlockStack>
                </Card>
            </Layout.Section>
        </Layout>
    );
}

function PreviewTab({ device, onDeviceChange, settings, css }) {
    const previewHtml = useMemo(
        () => buildPreviewHtml({ settings, css }),
        [settings, css],
    );

    const width = device === "mobile" ? 375 : device === "tablet" ? 768 : 1024;

    return (
        <Layout>
            <Layout.Section>
                <Card>
                    <InlineStack gap="200">
                        <Button pressed={device === "desktop"} onClick={() => onDeviceChange("desktop")}>Desktop</Button>
                        <Button pressed={device === "tablet"} onClick={() => onDeviceChange("tablet")}>Tablet</Button>
                        <Button pressed={device === "mobile"} onClick={() => onDeviceChange("mobile")}>Mobile</Button>
                    </InlineStack>
                </Card>
            </Layout.Section>
            <Layout.Section>
                <Card>
                    <div style={{
                        display: "flex", justifyContent: "center",
                        background: "#f6f6f7", padding: 16, borderRadius: 8,
                    }}>
                        <iframe
                            title="Reviewly preview"
                            srcDoc={previewHtml}
                            style={{
                                width: `${width}px`,
                                maxWidth: "100%",
                                height: 640,
                                border: "1px solid #ddd",
                                borderRadius: 8,
                                background: "#fff",
                            }}
                            sandbox="allow-same-origin"
                        />
                    </div>
                </Card>
            </Layout.Section>
        </Layout>
    );
}

function buildPreviewHtml({ settings, css }) {
    const reviews = settings.widgets.reviews || {};
    const carousel = settings.widgets.review_carousel || {};
    const global = settings.global || {};
    const starColor = reviews.starColor || global.starColor || "#FFC107";
    const textColor = reviews.textColor || global.textColor || "#1A1A1A";
    const radius = reviews.cardRadius ?? global.radius ?? 8;
    const font = reviews.fontFamily || global.fontFamily || "inherit";

    // Two sample reviews — no real data, safe for any tenant.
    const sampleCards = `
    <article class="rw-review">
      <header class="rw-review__head">
        <div class="rw-stars">★★★★★</div>
        <span class="rw-review__author">Sample Customer</span>
        <span class="rw-review__badge">✓ Verified purchase</span>
        <span class="rw-review__date">Jan 12, 2026</span>
      </header>
      <h4 class="rw-review__title">Excellent quality</h4>
      <p class="rw-review__body">Loved the packaging and the fit. Would buy again.</p>
    </article>
    <article class="rw-review">
      <header class="rw-review__head">
        <div class="rw-stars">★★★★☆</div>
        <span class="rw-review__author">Another Reviewer</span>
        <span class="rw-review__date">Feb 3, 2026</span>
      </header>
      <p class="rw-review__body">Good value for the price.</p>
    </article>
  `;

    // Inline the base widget styles + custom CSS, scoped.
    const scoped = prefixCssClient(css || "", ".reviewly-scope-reviews");

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; padding: 24px; font-family: ${font}; color: ${textColor}; }
  .reviewly-scope-reviews { max-width: 720px; margin: 0 auto; }
  .rw-stars { color: ${starColor}; letter-spacing: 2px; font-size: 14px; }
  .rw-review {
    border: 1px solid #eee; padding: 16px; border-radius: ${radius}px;
    margin-bottom: 16px; background: #fff;
  }
  .rw-review__head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .rw-review__author { font-weight: 600; }
  .rw-review__badge { background: #eaf7ee; color: #1b7a3e; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
  .rw-review__date { margin-left: auto; font-size: 12px; opacity: .6; }
  .rw-review__title { margin: 8px 0 4px; font-size: 15px; }
  .rw-review__body { margin: 0; font-size: 14px; line-height: 1.5; }
  ${scoped}
</style>
</head>
<body>
  <div class="reviewly-scope-reviews">
    ${sampleCards}
  </div>
</body>
</html>`;
}

function validateCssClient(css) {
    if (typeof css !== "string") return { errors: [] };
    if (css.length > CSS_MAX_LENGTH) {
        return { errors: [`CSS exceeds ${CSS_MAX_LENGTH} characters.`] };
    }
    const errors = [];
    const rules = [
        [/@import\b/i, "@import is not allowed"],
        [/url\s*\(\s*['"]?\s*(https?:|\/\/)/i, "external url() is not allowed"],
        [/expression\s*\(/i, "expression() is not allowed"],
        [/<\s*\/?\s*style/i, "HTML <style> injection is not allowed"],
        [/<\s*\/?\s*script/i, "script tags are not allowed"],
    ];
    for (const [re, msg] of rules) if (re.test(css)) errors.push(msg);

    let depth = 0;
    for (const ch of css) {
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth < 0) { errors.push("Unbalanced closing brace."); depth = 0; break; }
        }
    }
    if (depth > 0) errors.push("Missing closing brace.");
    return { errors };
}

function prefixCssClient(css, scope) {
    if (!css || !css.trim()) return "";
    // simplified prefixer for preview only (server version is authoritative)
    return css.replace(/(^|})\s*([^{@}][^{]*)\{/g, (m, prefix, sel) => {
        const prefixed = sel.split(",").map((s) => {
            const t = s.trim();
            if (t === ":root" || t === "html" || t === "body") return scope;
            return `${scope} ${t}`;
        }).join(", ");
        return `${prefix}${prefixed}{`;
    });
}

function humanLabel(key) {
    return key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
}

function pickMax(key) {
    const map = {
        cardRadius: 32, cardSpacing: 48, cardGap: 48, radius: 32, spacing: 48,
        perPage: 20, perViewDesktop: 5, perViewTablet: 4, perViewMobile: 3,
        cardLimit: 24, maxReviews: 24, starSize: 32, fontSize: 24,
        autoplayMs: 12000, columnsDesktop: 5, columnsMobile: 2,
        starSpacing: 12,
    };
    return map[key] ?? 100;
}

function hexToHsv(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return { hue: 0, saturation: 0, brightness: 1 };
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    return { hue: h, saturation: s, brightness: max };
}

function hsvToHex(hsv) {
    const h = hsv.hue, s = hsv.saturation, v = hsv.brightness;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else[r, g, b] = [c, 0, x];
    const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
    return `#${to(r)}${to(g)}${to(b)}`;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);