import { SquareClient, SquareEnvironment } from "square";

const c = new SquareClient({ token: "EAAAl_sandbox_test", environment: SquareEnvironment.Sandbox });

// Probe catalog.list
const listResult = c.catalog.list({ types: "ITEM" });
console.log("catalog.list type:", typeof listResult, listResult?.constructor?.name);

// Check if it's an async iterable
if (listResult && typeof listResult[Symbol.asyncIterator] === "function") {
  console.log("catalog.list returns AsyncIterable");
} else if (listResult && typeof listResult.then === "function") {
  console.log("catalog.list returns Promise");
  try {
    const r = await listResult;
    console.log("result keys:", Object.keys(r));
  } catch (e) {
    console.log("error (expected with fake token):", e.message?.slice(0, 100));
  }
} else {
  console.log("catalog.list returns:", listResult);
}

// Probe merchants.get
const mResult = c.merchants.get("me");
console.log("merchants.get type:", typeof mResult, mResult?.constructor?.name);
if (mResult && typeof mResult.then === "function") {
  try {
    const r = await mResult;
    console.log("merchants.get result keys:", Object.keys(r));
  } catch (e) {
    console.log("merchants.get error:", e.message?.slice(0, 100));
  }
}
