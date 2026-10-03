import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
async function run() {
  try {
    const review = await db.review.findFirst({
      where: { id: "6ac01e4f3795448aeea7fadd", shop: "foo" }
    });
    console.log("Success", review);
  } catch (err) {
    if (err.message.includes("Invalid")) {
       console.log("Validation error:", err.message);
    } else {
       console.log("Other error:", err.message);
    }
  }
}
run();
