export const WIDGETS = {
    reviews: {
        label: "Reviewly Reviews",
        defaultEnabled: true,
        settings: {
            heading: "Customer Reviews",
            showTitle: true,
            showAuthor: true,
            showDate: true,
            showVerified: true,
            showMedia: true,
            showPagination: true,
            perPage: 5,
            sortOrder: "recent",
            cardRadius: 8,
            cardSpacing: 16,
            starColor: "#FFC107",
            starEmptyColor: "#E0E0E0",
            textColor: "#1A1A1A",
            accentColor: "#111111",
            badgeBg: "#F4F4F4",
            badgeText: "#333333",
            fontFamily: "inherit",
        },
    },
    star_rating: {
        label: "Reviewly Star Rating",
        defaultEnabled: true,
        settings: {
            showAverage: true,
            showCount: true,
            starSize: 14,
            starSpacing: 2,
            starColor: "#FFC107",
            starEmptyColor: "#E0E0E0",
            textColor: "#1A1A1A",
            fontSize: 14,
            alignment: "inline-start",
        },
    },
    photo_reviews: {
        label: "Reviewly Photo Reviews",
        defaultEnabled: true,
        settings: {
            heading: "Customer Photos",
            showName: true,
            showStars: true,
            showText: true,
            showDate: true,
            showVerified: true,
            columnsDesktop: 3,
            columnsMobile: 2,
            cardLimit: 9,
            aspectRatio: "1 / 1",
            cardGap: 16,
            cardRadius: 12,
            starColor: "#FFC107",
            starEmptyColor: "#E0E0E0",
            textColor: "#1A1A1A",
            accentColor: "#111111",
        },
    },
    review_carousel: {
        label: "Reviewly Review Carousel",
        defaultEnabled: true,
        settings: {
            heading: "What our customers say",
            maxReviews: 12,
            perViewDesktop: 3,
            perViewTablet: 2,
            perViewMobile: 1,
            cardGap: 16,
            cardRadius: 12,
            showArrows: true,
            showDots: true,
            autoplay: false,
            autoplayMs: 5000,
            showName: true,
            showStars: true,
            showDate: true,
            showProduct: false,
            showThumbnail: false,
            showVerified: true,
            starColor: "#FFC107",
            starEmptyColor: "#E0E0E0",
            textColor: "#1A1A1A",
            accentColor: "#111111",
            cardBg: "#FFFFFF",
            cardBorder: "#EAEAEA",
        },
    },
};

export const GLOBAL_DEFAULTS = {
    fontFamily: "inherit",
    starColor: "#FFC107",
    starEmptyColor: "#E0E0E0",
    textColor: "#1A1A1A",
    accentColor: "#111111",
    borderColor: "#EAEAEA",
    bgColor: "transparent",
    radius: 12,
    spacing: 16,
    containerWidth: "100%",
};

const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function coerceSetting(key, value, template) {
    const t = typeof template;

    if (t === "boolean") return Boolean(value);
    if (t === "number") {
        const n = Number(value);
        if (!Number.isFinite(n)) return template;
        return n;
    }
    if (key.toLowerCase().includes("color") && typeof value === "string") {
        return COLOR_RE.test(value) ? value : template;
    }
    if (t === "string") {
        if (typeof value !== "string") return template;
        if (key === "heading" || key === "description") {
            return value.slice(0, 200).replace(/[<>]/g, "");
        }
        return value.slice(0, 120);
    }
    return template;
}

export function validateWidgetSettings(widgetId, incoming) {
    const def = WIDGETS[widgetId];
    if (!def) throw new Error(`Unknown widget: ${widgetId}`);

    const out = {};
    for (const [key, template] of Object.entries(def.settings)) {
        if (key in (incoming || {})) {
            out[key] = coerceSetting(key, incoming[key], template);
        } else {
            out[key] = template;
        }
    }
    return out;
}

export function validateGlobalSettings(incoming) {
    const out = {};
    for (const [key, template] of Object.entries(GLOBAL_DEFAULTS)) {
        out[key] = coerceSetting(key, incoming?.[key], template);
    }
    return out;
}

export const CSS_MAX_LENGTH = 20_000;

const FORBIDDEN_PATTERNS = [
    { re: /@import\b/i, reason: "@import is not allowed" },
    { re: /url\s*\(\s*['"]?\s*(https?:|\/\/)/i, reason: "external url() is not allowed" },
    { re: /expression\s*\(/i, reason: "expression() is not allowed" },
    { re: /behavior\s*:/i, reason: "behavior: is not allowed" },
    { re: /javascript\s*:/i, reason: "javascript: is not allowed" },
    { re: /<\s*\/?\s*style/i, reason: "HTML <style> injection is not allowed" },
    { re: /<\/?\s*script/i, reason: "script tags are not allowed" },
];

export function validateCustomCss(css) {
    const errors = [];
    if (typeof css !== "string") {
        return { ok: false, errors: ["CSS must be a string."] };
    }
    if (css.length > CSS_MAX_LENGTH) {
        return {
            ok: false,
            errors: [`CSS exceeds ${CSS_MAX_LENGTH} characters (${css.length}).`],
        };
    }
    for (const { re, reason } of FORBIDDEN_PATTERNS) {
        if (re.test(css)) errors.push(reason);
    }
    let depth = 0;
    for (const ch of css) {
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth < 0) {
                errors.push("Unbalanced closing brace.");
                depth = 0;
                break;
            }
        }
    }
    if (depth > 0) errors.push("Missing closing brace.");
    return { ok: errors.length === 0, errors };
}
