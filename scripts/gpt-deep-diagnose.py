#!/usr/bin/env python3
"""
Deep GPT-4o consultation: why do Square Orders not appear in Square POS?
All relevant facts gathered from diagnostic run.
"""
import os, json
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# Full context from diagnostic
diagnostic_context = """
## Square Integration Diagnostic Results

### Environment
- Square environment: PRODUCTION (https://connect.squareup.com)
- Merchant ID: MLMSYK18WQFHR
- Location ID: LTE87YB51D7WV (FÜDA - PHYSICAL, ACTIVE)
- Second location: LKP4Q4FES6A31 (FÜDA : STALL - MOBILE, ACTIVE)
- Account email: info@fuda.com.au
- Square POS is logged into: info@fuda.com.au (same account)

### Recent Orders Created via API
1. Order ID: 79JTT3nj5Ns6SQkROUGDuY77haVZY
   - State: OPEN
   - Source: {"name":"FÜDA"}
   - Created: 2026-04-06T04:34:31.556Z
   - Fulfillments: [{"type":"PICKUP","state":"PROPOSED","recipient":"Test Customer v2"}]
   - pickupAt: 2026-04-06T04:49:30.648Z

2. Order ID: f3llo4rYPWaTVHDMj7vuuWWnfzSZY
   - State: OPEN
   - Source: {"name":"fuda lunch app"}
   - Created: 2026-04-06T04:25:56.308Z
   - Fulfillments: [{"type":"PICKUP","state":"PROPOSED","recipient":"Test Customer"}]

### Orders from Square POS (for comparison)
- Order ID: 9oaBE6ji08Le6uMqVghuYRQjUzbZY
  - State: COMPLETED
  - Source: {"name":"Point of Sale"}
  - Fulfillments: [{"type":"SIMPLE","state":"COMPLETED"}]
  (This is what a real POS order looks like)

### Key Observations
1. API-created orders have state=OPEN and PICKUP fulfillment - they ARE in Square's system
2. POS-created orders use source "Point of Sale" and SIMPLE fulfillment type
3. API orders are NOT appearing in Square POS Orders tab despite being OPEN
4. Square KDS is configured with auto-print enabled, Epson TM-T82 connected
5. The pickupAt time has already passed (orders were created hours ago)

### What We've Tried
- Added fulfillments array with PICKUP type and PROPOSED state
- Added state: "OPEN" explicitly  
- Added source: { name: "FÜDA" }
- Orders confirm as OPEN in Square API but don't appear in POS

### Square POS Settings (confirmed by user)
- KDS app installed
- Auto-print enabled
- Fulfillment types enabled (Pickup, Delivery, Online Orders)
- FÜDA location assigned to KDS

### Question
Why would Square Orders created via the Orders API with state=OPEN and PICKUP fulfillment
NOT appear in the Square POS Orders tab, even though:
1. The account is the same (info@fuda.com.au)
2. The location ID matches
3. The orders are confirmed OPEN in the API
4. The POS is connected to the same Square account

What specific configuration, order structure, or API approach is needed to make
Orders API orders appear in Square POS and trigger auto-printing?

Please provide:
1. The exact root cause
2. The exact fix (with code if applicable)
3. Any Square POS settings that need to be changed
4. Whether there's a known limitation with Square Orders API and POS visibility
"""

print("Consulting GPT-4o with full diagnostic context...\n")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "system",
            "content": (
                "You are a Square POS integration expert with deep knowledge of the Square Orders API, "
                "Square KDS, and how orders flow from the API to the POS. "
                "Be specific and technical. Focus on the exact root cause and fix."
            )
        },
        {
            "role": "user",
            "content": diagnostic_context
        }
    ],
    max_tokens=2000,
    temperature=0.2,
)

diagnosis = response.choices[0].message.content
print("=" * 60)
print("GPT-4o DEEP DIAGNOSIS:")
print("=" * 60)
print(diagnosis)

with open("scripts/gpt-deep-diagnosis.txt", "w") as f:
    f.write(diagnosis)

print("\n✅ Deep diagnosis saved to scripts/gpt-deep-diagnosis.txt")
