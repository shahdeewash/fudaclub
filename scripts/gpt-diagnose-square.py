"""
GPT-assisted Square POS order visibility diagnostic.
Fetches the last test order from Square, inspects all fields,
then asks GPT-4o to diagnose why it's not appearing in Square POS.
"""
import os
import json
import subprocess
import sys

# Install openai if needed
try:
    import openai
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openai", "-q"])
    import openai

OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
if not OPENAI_KEY:
    print("❌ OPENAI_API_KEY not set")
    sys.exit(1)

client = openai.OpenAI(api_key=OPENAI_KEY)

# ── Step 1: Fetch the test order from Square ──────────────────────────────
print("Step 1: Fetching test order from Square API...")

fetch_script = """
import { SquareClient, SquareEnvironment } from "square";
import dotenv from "dotenv";
dotenv.config();

const env = process.env.SQUARE_ENVIRONMENT === "production"
  ? SquareEnvironment.Production
  : SquareEnvironment.Sandbox;

// Get the access token from the DB
import { getDb } from "../server/db.js";
const db = await getDb();
if (!db) { console.log(JSON.stringify({ error: "no db" })); process.exit(1); }

const { squareConnections } = await import("../drizzle/schema.js");
const conns = await db.select().from(squareConnections).limit(1);
if (!conns.length) { console.log(JSON.stringify({ error: "no connection" })); process.exit(1); }

const conn = conns[0];
const sqClient = new SquareClient({ token: conn.accessToken, environment: env });

// Fetch the last test order
const orderId = "f3llo4rYPWaTVHDMj7vuuWWnfzSZY"; // TEST-PRINT-002
const resp = await (sqClient.orders as any).get({ orderId });
const order = resp?.order;

// Also list recent orders for this location
const listResp = await (sqClient.orders as any).search({
  locationIds: [conn.locationId],
  query: { filter: { stateFilter: { states: ["OPEN"] } }, sort: { sortField: "CREATED_AT", sortOrder: "DESC" } },
  limit: 5,
});

console.log(JSON.stringify({
  testOrder: order,
  recentOpenOrders: listResp?.orders ?? [],
  locationId: conn.locationId,
  merchantId: conn.merchantId,
}, null, 2));
"""

with open("/tmp/fetch-sq-order.mts", "w") as f:
    f.write(fetch_script)

result = subprocess.run(
    ["npx", "tsx", "/tmp/fetch-sq-order.mts"],
    capture_output=True, text=True, timeout=30,
    cwd="/home/ubuntu/fuda-corporate-lunch"
)

raw_output = result.stdout + result.stderr
print("Square API response (raw):")
print(raw_output[:3000])

# Try to parse JSON from output
order_data = {}
for line in raw_output.split("\n"):
    if line.strip().startswith("{"):
        try:
            order_data = json.loads(line.strip())
            break
        except:
            pass

# Try multi-line JSON
try:
    start = raw_output.find("{")
    if start >= 0:
        order_data = json.loads(raw_output[start:])
except:
    pass

# ── Step 2: Ask GPT to diagnose ───────────────────────────────────────────
print("\nStep 2: Asking GPT-4o to diagnose why order is not visible in Square POS...")

context = f"""
We are building FÜDA, a corporate lunch ordering app that pushes orders to Square POS for receipt printing.
The Epson TM-T82 is connected to Square POS hardware (Square Stand/Terminal) via USB.
Square KDS is installed on a separate tablet.

PROBLEM: Orders created via the Square Orders API are NOT appearing in:
- Square POS → Orders tab
- Square KDS

The order was created successfully (we get a Square Order ID back), but it never shows up in POS or KDS.

Here is the full Square Order object we created:
{json.dumps(order_data, indent=2, default=str)[:4000]}

Here is our current createSquareOrderForPrinting code:
```typescript
const response = await (client.orders as any).create({{
  order: {{
    locationId: conn.locationId,
    referenceId: fudaOrderNumber,
    lineItems: squareLineItems,
    fulfillments: [
      {{
        type: "PICKUP",
        state: "PROPOSED",
        pickupDetails: {{
          recipient: {{
            displayName: customerName ?? `Order ${{fudaOrderNumber}}`,
          }},
          pickupAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          note: specialInstructions ?? undefined,
        }},
      }},
    ],
  }},
  idempotencyKey,
}});
```

Questions for GPT:
1. What is wrong with this order that prevents it from appearing in Square POS Orders tab?
2. What is wrong that prevents it from appearing in Square KDS?
3. What EXACT changes to the order creation payload are needed?
4. Is there a specific Square API endpoint or order field that triggers POS visibility?
5. Do we need to use a different API (e.g. Square Online API, Square Catalog, or a specific source_name)?

Please provide the EXACT corrected TypeScript code for the order creation payload.
"""

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a Square POS integration expert. Provide precise, actionable fixes with exact code."},
        {"role": "user", "content": context}
    ],
    max_tokens=2000,
    temperature=0.2
)

advice = response.choices[0].message.content
print("\n" + "="*60)
print("GPT-4o DIAGNOSIS:")
print("="*60)
print(advice)

# Save to file
with open("/home/ubuntu/fuda-corporate-lunch/scripts/gpt-square-diagnosis.txt", "w") as f:
    f.write(f"Square Order Data:\n{json.dumps(order_data, indent=2, default=str)}\n\n")
    f.write(f"GPT-4o Diagnosis:\n{advice}\n")

print("\n✅ Diagnosis saved to scripts/gpt-square-diagnosis.txt")
