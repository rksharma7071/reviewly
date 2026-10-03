import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  try {
    const res = await prisma.review.findMany({
      where: {
        media: { not: null }
      },
      take: 1
    });
    console.log("Success with not: null");
  } catch (err) {
    console.log("Error with not: null", err.message);
  }
}
run();
