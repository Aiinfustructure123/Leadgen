import { config as loadEnv } from "dotenv";
import { LeadStatus, Role } from "@prisma/client";

loadEnv({ path: ".env.local" });
loadEnv();

import { prisma } from "@/lib/prisma";

async function main() {
  const existing = await prisma.lead.count();
  if (existing > 0) {
    console.log("Demo data already present, skipping seed.");
    return;
  }

  const lead = await prisma.lead.create({
    data: {
      salesforceId: "00Qdemo00000001",
      firstName: "Alex",
      lastName: "Taylor",
      email: "alex.taylor@example.com",
      phone: "+447700900123",
      enquiryType: "2-bed Marylebone",
      propertyRef: "OH-MARY-2B-301",
      source: "Website",
      consentSource: "Salesforce enquiry form",
      status: LeadStatus.ENGAGED,
      qualification: {
        budget: "£1.2m - £1.5m",
        location: "Marylebone",
        beds: "2",
        timeline: "3 months",
        buyerType: "Owner occupier",
        financing: "Mortgage in principle",
      },
      lastActivityAt: new Date(),
      lastInboundAt: new Date(),
      conversations: {
        create: {
          messages: {
            create: [
              {
                role: Role.LEAD,
                body: "Hi, is the Marylebone 2-bed still available for viewings?",
              },
              {
                role: Role.AI,
                body: "Hi Alex — I'm the AI assistant at One Homes. Yes, I can help arrange a viewing. What's your preferred time this week?",
              },
            ],
          },
        },
      },
      notes: {
        create: [
          {
            body: "Strong buyer intent. Mentioned school catchment as priority.",
            pinned: true,
          },
        ],
      },
      followUps: {
        create: [
          {
            title: "Send viewing slots",
            notes: "Offer weekday evening slots first.",
            dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
            priority: "HIGH",
          },
        ],
      },
    },
  });

  await prisma.lead.create({
    data: {
      salesforceId: "00Qdemo00000002",
      firstName: "Priya",
      lastName: "Shah",
      email: "priya.shah@example.com",
      phone: "+447700900456",
      enquiryType: "Investor - Chelsea 1-bed",
      source: "Rightmove",
      status: LeadStatus.CONTACTED,
      qualification: {
        budget: "£900k",
        location: "Chelsea",
        buyerType: "Investor",
      },
      lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });

  console.log(`Seeded demo leads (primary: ${lead.id}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
