import { SquareClient, SquareEnvironment } from "square";
import { getDb } from "../server/db.js";
import { squareConnections } from "../drizzle/schema.js";
import { randomUUID } from "crypto";

const db = await getDb();
const rows = await db.select().from(squareConnections).limit(1);
const conn = rows[0];
const client = new SquareClient({ token: conn.accessToken, environment: SquareEnvironment.Production });

const paymentRes = await (client.payments as any).create({
  sourceId: "EXTERNAL",
  idempotencyKey: randomUUID(),
  amountMoney: { amount: BigInt(3050), currency: "AUD" },
  orderId: "lQ6yNx0w1iuu4H0AgKtRG3tq4KZZY",
  locationId: conn.locationId,
  externalDetails: { type: "OTHER", source: "FÜDA App", sourceFeeMoney: { amount: BigInt(0), currency: "AUD" } },
  note: "FÜDA test v5 GST",
});
console.log("Payment:", paymentRes?.payment?.id, paymentRes?.payment?.status);
process.exit(0);
