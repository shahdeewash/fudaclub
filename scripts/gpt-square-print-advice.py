import os
import json
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# Read the current square.ts to give GPT full context
with open("/home/ubuntu/fuda-corporate-lunch/server/square.ts", "r") as f:
    square_ts = f.read()

context = """
We have a FÜDA corporate lunch ordering web app built with React + tRPC + Express.
When an order is placed, we already create a Square Order via the Orders API (createSquareOrderForPrinting function).
The Square Order is created successfully and appears in Square Dashboard.

Hardware setup:
- Epson TM-T82 thermal receipt printer
- Connected via USB to Square POS hardware (Square Stand or Square Register)
- Square POS app is running on the device
- Square KDS app is also available on a separate tablet

The problem:
- Orders created via the Square Orders API do NOT automatically print on the Epson TM-T82
- Square POS "Automatically Print New Orders" is enabled
- The printer profile "FUDA Lunch" has been created in Square Dashboard
- Orders appear in Square Dashboard but NOT in Square POS Orders tab

We need to find the EXACT technical solution to make orders from our web app automatically print on the Epson TM-T82 via Square POS.

Here is our current square.ts implementation:
"""

print("Consulting GPT-5 for Square printing solution...")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "system",
            "content": """You are an expert in Square POS API integration and receipt printing. 
    You have deep knowledge of Square's Orders API, Terminal API, KDS, and how third-party apps 
    can trigger receipt printing on Square-connected printers. 
    Provide specific, actionable technical solutions with exact API calls and code."""
        },
        {
            "role": "user",
            "content": context + "\n\nCurrent square.ts:\n```typescript\n" + square_ts[:3000] + "\n```\n\n" + 
    """Please answer these specific questions:
    1. Why do Square Orders API orders NOT appear in Square POS Orders tab or trigger auto-print?
    2. What is the EXACT technical solution to make our web app orders print on the Epson TM-T82 connected to Square POS hardware?
    3. Should we use Square Terminal API, Square KDS API, or another approach?
    4. What specific API calls, parameters, or fulfillment settings are needed?
    5. Is there a webhook or polling approach that would work?
    
    Be specific with API endpoints, request parameters, and code examples."""
        }
    ],
    max_tokens=2000,
)

advice = response.choices[0].message.content
print("\n=== GPT-5 ADVICE ===\n")
print(advice)

# Save to file
with open("/home/ubuntu/fuda-corporate-lunch/scripts/gpt-print-advice.txt", "w") as f:
    f.write(advice)

print("\n=== Saved to gpt-print-advice.txt ===")
