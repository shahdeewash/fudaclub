import { createSquareOrderForPrinting } from "../server/square.js";

console.log("Testing Square order creation WITH fulfillment details (GPT fix)...");

const result = await createSquareOrderForPrinting(
  99999,
  "TEST-PRINT-002",
  [
    { menuItemId: 1, itemName: "Steamed Chicken Momo", quantity: 2, unitPriceInCents: 1500, variationId: null, modifierNote: null },
    { menuItemId: 2, itemName: "Bubble Tea", quantity: 1, unitPriceInCents: 650, variationId: null, modifierNote: null },
  ],
  "Test order — please print",
  "Test Customer",
  null
);

if (result) {
  console.log("✅ Square Order created with fulfillment:", result);
  console.log("Check Square POS → Orders tab for order TEST-PRINT-002.");
  console.log("If auto-print is enabled on the Epson, it should print now.");
} else {
  console.log("❌ Square Order creation failed — check server logs");
}
