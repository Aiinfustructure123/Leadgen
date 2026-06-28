import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed a sample property so get_property_details has authoritative data.
  await prisma.property.upsert({
    where: { ref: "OH-MARY-201" },
    update: {},
    create: {
      ref: "OH-MARY-201",
      title: "Elegant 2-bed apartment, Marylebone",
      area: "Marylebone, London W1",
      price: "£1,250,000",
      bedrooms: 2,
      bathrooms: 2,
      sizeSqft: 980,
      status: "available",
      description:
        "A bright, high-spec two-bedroom apartment moments from Marylebone High Street, with a 24h concierge and lift access.",
      features: ["Concierge", "Lift", "Underfloor heating", "South-facing"],
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
