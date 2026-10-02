import { useLoaderData, useNavigate, useSubmit, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  ButtonGroup,
  Button,
  InlineStack,
  TextField,
  Divider,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useState } from "react";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const id = params.id;

  const review = await db.review.findUnique({
    where: { id: String(id), shop },
    include: { product: true },
  });

  if (!review) {
    throw new Response("Review not found", { status: 404 });
  }

  return { review };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const id = params.id;

  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "approve") {
    await db.review.update({
      where: { id: String(id), shop },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
  } else if (actionType === "reject") {
    await db.review.update({
      where: { id: String(id), shop },
      data: { status: "REJECTED" },
    });
  } else if (actionType === "delete") {
    await db.review.delete({
      where: { id: String(id), shop },
    });
    return new Response(null, {
      status: 302,
      headers: { Location: "/app/reviews" },
    });
  } else if (actionType === "reply") {
    const merchantReply = formData.get("merchantReply");
    await db.review.update({
      where: { id: String(id), shop },
      data: { merchantReply: String(merchantReply), repliedAt: new Date() },
    });
  }

  return { success: true };
};

export default function ReviewDetailsPage() {
  const { review } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [replyText, setReplyText] = useState(review.merchantReply || "");

  const handleAction = (action) => {
    submit({ action }, { method: "POST" });
  };

  const handleReplySubmit = () => {
    submit({ action: "reply", merchantReply: replyText }, { method: "POST" });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "PUBLISHED":
      case "FEATURED":
        return <Badge tone="success">Published</Badge>;
      case "PENDING":
        return <Badge tone="warning">Pending</Badge>;
      case "REJECTED":
        return <Badge tone="critical">Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <Page
      breadcrumbs={[{ content: "Reviews", onAction: () => navigate("/app/reviews") }]}
      title="Review Details"
      primaryAction={
        review.status === "PENDING"
          ? {
              content: "Approve",
              onAction: () => handleAction("approve"),
              loading: isSubmitting,
            }
          : review.status === "REJECTED"
          ? {
              content: "Publish",
              onAction: () => handleAction("approve"),
              loading: isSubmitting,
            }
          : {
              content: "Hide",
              onAction: () => handleAction("reject"),
              loading: isSubmitting,
            }
      }
      secondaryActions={[
        {
          content: "Delete",
          destructive: true,
          onAction: () => {
            if (confirm("Are you sure you want to delete this review?")) {
              handleAction("delete");
            }
          },
          loading: isSubmitting,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingLg">
                  {review.title || "Untitled Review"}
                </Text>
                {getStatusBadge(review.status)}
              </InlineStack>

              <InlineStack gap="200" align="start">
                <Text variant="bodyMd" fontWeight="bold">
                  {review.rating} / 5 Stars
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  by {review.authorName} {review.authorEmail ? `(${review.authorEmail})` : ""}
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  on {new Date(review.createdAt).toLocaleDateString()}
                </Text>
              </InlineStack>

              <Divider />

              <Text as="p" variant="bodyMd">
                {review.body}
              </Text>

              {review.media && review.media.length > 0 && (
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Media
                  </Text>
                  <InlineStack gap="200">
                    {review.media.map((m, idx) => (
                      <div key={idx} style={{ maxWidth: "200px" }}>
                        {m.type === "IMAGE" ? (
                          <img
                            src={m.url}
                            alt="Review media"
                            style={{ width: "100%", borderRadius: "8px" }}
                          />
                        ) : (
                          <video
                            src={m.url}
                            controls
                            style={{ width: "100%", borderRadius: "8px" }}
                          />
                        )}
                      </div>
                    ))}
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Merchant Reply
              </Text>
              <TextField
                label="Public reply to this review"
                value={replyText}
                onChange={setReplyText}
                multiline={4}
                autoComplete="off"
                placeholder="Thank you for your feedback!"
              />
              <InlineStack align="end">
                <Button onClick={handleReplySubmit} loading={isSubmitting} variant="primary">
                  {review.merchantReply ? "Update Reply" : "Add Reply"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Product Details
              </Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="bold">
                  {review.product?.title || "Unknown Product"}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Product ID: {review.product?.productId || review.productId}
                </Text>
                {review.verifiedPurchase && (
                  <Badge tone="success">Verified Purchase</Badge>
                )}
              </BlockStack>
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
