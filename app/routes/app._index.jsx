import { useLoaderData, useNavigate } from "react-router";
import { Page, Layout, Card, BlockStack, Text, Grid, Button, Icon, Badge } from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [totalReviews, pendingReviews, agg] = await Promise.all([
    db.review.count({ where: { shop } }),
    db.review.count({ where: { shop, status: "PENDING" } }),
    db.review.aggregate({
      where: { shop, status: { in: ["PUBLISHED", "FEATURED"] } },
      _avg: { rating: true },
    }),
  ]);

  return {
    totalReviews,
    pendingReviews,
    averageRating: Number((agg._avg.rating ?? 0).toFixed(1)),
  };
};

export default function Dashboard() {
  const { totalReviews, pendingReviews, averageRating } = useLoaderData();
  const navigate = useNavigate();

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" color="subdued">
                    Total Reviews
                  </Text>
                  <Text as="p" variant="headingLg">
                    {totalReviews}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" color="subdued">
                    Average Rating
                  </Text>
                  <Text as="p" variant="headingLg">
                    {averageRating} / 5.0
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" color="subdued">
                    Pending Moderation
                  </Text>
                  <Text as="p" variant="headingLg">
                    {pendingReviews > 0 ? (
                      <Badge tone="warning">{pendingReviews} reviews</Badge>
                    ) : (
                      <Badge tone="success">All caught up</Badge>
                    )}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Welcome to Reviewly
                </Text>
                <Text as="p">
                  Reviewly helps you collect and showcase customer reviews on your store. You can manage your incoming reviews, approve them for display, or reject them.
                </Text>
              </BlockStack>
              <Button onClick={() => navigate("/app/reviews")} variant="primary">
                Manage Reviews
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
