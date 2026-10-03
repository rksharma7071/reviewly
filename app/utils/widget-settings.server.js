import db from "../db.server";
import { WIDGETS, GLOBAL_DEFAULTS } from "./widget-settings-shared.js";
export * from "./widget-settings-shared.js";

const AT_RULES_WITH_SELECTOR_BLOCK = new Set([
    "@media",
    "@supports",
    "@layer",
    "@container",
    "@document",
]);

const AT_RULES_WITHOUT_SELECTOR_BLOCK = new Set([
    "@font-face",
    "@keyframes",
    "@-webkit-keyframes",
]);

export function prefixCss(css, scopeSelector) {
    if (!css || !css.trim()) return "";
    if (!scopeSelector) return "";

    let out = "";
    let i = 0;

    const len = css.length;
    while (i < len) {
        while (i < len && /\s/.test(css[i])) i++;
        if (i >= len) break;

        if (css[i] === "@") {
            const nameMatch = /^@[\w-]+/.exec(css.slice(i));
            const name = nameMatch ? nameMatch[0].toLowerCase() : "@";
            const braceIdx = css.indexOf("{", i);
            const semiIdx = css.indexOf(";", i);
            const hasBlock = braceIdx !== -1 && (semiIdx === -1 || braceIdx < semiIdx);

            if (AT_RULES_WITHOUT_SELECTOR_BLOCK.has(name) || !hasBlock) {
                const end = hasBlock ? matchClose(css, braceIdx) : semiIdx + 1;
                out += css.slice(i, end);
                i = end;
            } else if (AT_RULES_WITH_SELECTOR_BLOCK.has(name)) {
                const end = matchClose(css, braceIdx);
                const header = css.slice(i, braceIdx + 1);
                const body = css.slice(braceIdx + 1, end - 1);
                out += header + prefixCss(body, scopeSelector) + "}";
                i = end;
            } else {
                const end = matchClose(css, braceIdx);
                out += css.slice(i, end);
                i = end;
            }
            continue;
        }

        const braceIdx = css.indexOf("{", i);
        if (braceIdx === -1) {
            out += css.slice(i);
            break;
        }
        const selector = css.slice(i, braceIdx).trim();
        const end = matchClose(css, braceIdx);
        const body = css.slice(braceIdx, end);

        const prefixed = selector
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
                if (s === ":root" || s === "html" || s === "body") return scopeSelector;
                return `${scopeSelector} ${s}`;
            })
            .join(", ");

        out += `${prefixed} ${body}`;
        i = end;
    }

    return out;
}

function matchClose(css, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    return css.length;
}

export async function getOrCreateConfig(shop) {
    let config = await db.widgetConfig.findUnique({ where: { shop } });
    if (config) return config;

    const widgets = {};
    const enabled = {};
    for (const [id, def] of Object.entries(WIDGETS)) {
        widgets[id] = { ...def.settings };
        enabled[id] = def.defaultEnabled;
    }

    config = await db.widgetConfig.create({
        data: {
            shop,
            global: GLOBAL_DEFAULTS,
            widgets,
            enabled,
            customCss: "",
        },
    });
    return config;
}

export function resolveWidgetSettings(widgetId, config) {
    const def = WIDGETS[widgetId];
    if (!def) return {};
    const global = { ...GLOBAL_DEFAULTS, ...(config.global || {}) };
    const widget = { ...def.settings, ...((config.widgets || {})[widgetId] || {}) };

    return {
        ...widget,
        fontFamily: widget.fontFamily ?? global.fontFamily,
        starColor: widget.starColor ?? global.starColor,
        starEmptyColor: widget.starEmptyColor ?? global.starEmptyColor,
        textColor: widget.textColor ?? global.textColor,
        accentColor: widget.accentColor ?? global.accentColor,
        borderColor: widget.borderColor ?? global.borderColor,
        bgColor: widget.bgColor ?? global.bgColor,
        radius: widget.cardRadius ?? widget.radius ?? global.radius,
        spacing: widget.cardSpacing ?? widget.cardGap ?? global.spacing,
    };
}
