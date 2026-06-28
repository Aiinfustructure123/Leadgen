import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // Seed a sample property so get_property_details has real facts to return.
  await prisma.property.upsert({
    where: { propertyRef: "OH-MAR-204" },
    update: {},
    create: {
      propertyRef: "OH-MAR-204",
      title: "Elegant 2-bedroom apartment, Marylebone",
      area: "Marylebone, London W1",
      price: "£1,250,000",
      bedrooms: 2,
      bathrooms: 2,
      sizeSqft: 980,
      status: "available",
      description:
        "A bright, recently refurbished two-bedroom apartment moments from Marylebone High Street, with a 24h concierge and lift access.",
      factsJson: {
        tenure: "Leasehold",
        serviceCharge: "£4,800/year",
        outdoorSpace: "Juliet balcony",
      },
    },
  });

  console.log("Seeded sample property OH-MAR-204");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
