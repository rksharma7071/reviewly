// app/routes/api.widget-config.jsx
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
    getOrCreateConfig,
    resolveWidgetSettings,
    prefixCss,
    WIDGETS,
} from "../utils/widget-settings.server";

export const loader = async ({ request }) => {
    await authenticate.public.appProxy(request);

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const widgetId = url.searchParams.get("widget");

    if (!shop) return data({ error: "shop is required" }, { status: 400 });
    if (!widgetId || !WIDGETS[widgetId]) {
        return data({ error: "unknown widget" }, { status: 400 });
    }

    const config = await getOrCreateConfig(shop);

    const enabled = config.enabled?.[widgetId] ?? WIDGETS[widgetId].defaultEnabled;
    if (!enabled) {
        return data(
            { enabled: false, settings: {}, css: "" },
            {
                headers: {
                    "Cache-Control": "public, max-age=60, s-maxage=300",
                },
            },
        );
    }

    const scope = `.reviewly-scope-${widgetId}`;
    const settings = resolveWidgetSettings(widgetId, config);
    const safeCustom = prefixCss(config.customCss || "", scope);

    return data(
        {
            enabled: true,
            settings,
            css: safeCustom,
        },
        {
            headers: {
                "Cache-Control": "public, max-age=60, s-maxage=300",
            },
        },
    );
};