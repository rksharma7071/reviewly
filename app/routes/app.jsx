import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useEffect } from "react";

export default function App() {
  const { apiKey } = useLoaderData();

  useEffect(() => {
    window.$crisp = [];
    window.CRISP_WEBSITE_ID = "f251cbad-368e-4e30-86bb-483d2a24d5a9";

    const d = document;
    const s = d.createElement("script");
    s.src = "https://client.crisp.chat/l.js";
    s.async = 1;
    d.getElementsByTagName("head")[0].appendChild(s);
  }, []);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <s-app-nav>
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/reviews">Reviews</s-link>
          <s-link href="/app/widget-customization">Widget Customization</s-link>
        </s-app-nav>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
