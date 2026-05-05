import { Link } from "wouter";

export default function Refunds() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link href="/">
            <a className="text-2xl font-black text-[#C9A84C]">FÜDA <span className="text-sm font-normal text-foreground/60">Club</span></a>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-black mb-2">Refunds &amp; Cancellation</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: 5 May 2026</p>

        <div className="prose prose-neutral max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold mb-2">Cancelling your subscription</h2>
            <p>
              You can cancel anytime from your{" "}
              <Link href="/profile"><a className="underline">Profile</a></Link> page. There's
              no cancellation fee and no minimum lock-in.
            </p>
            <p className="mt-2">
              When you cancel, your subscription stays active until the end of the period
              you've already paid for. After that, it ends — no further charges.
            </p>
            <p className="mt-2">
              Your unused FÜDA Coins remain spendable until the end of that paid period
              (your "coin grace window"). After it expires, unused coins are gone.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">Pause instead of cancel</h2>
            <p>
              Going on holiday? You can <strong>freeze</strong> your subscription for up
              to 14 days from your Profile. Billing pauses and resumes automatically. No
              refund needed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">Refund policy</h2>
            <p>
              Subscription fees are <strong>not refundable</strong> for unused portions of
              a period you've already paid for, but you keep using the benefits until that
              period ends — that's why we don't pro-rate.
            </p>
            <p className="mt-2">
              <strong>Exceptions where we will refund:</strong>
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>You were charged after cancelling (clear billing error).</li>
              <li>Duplicate charges from a payment retry.</li>
              <li>You signed up by mistake and haven't used the service yet — email us within 24 hours.</li>
            </ul>
            <p className="mt-2">
              Refunds for genuine service failures (we lost your order, missed delivery,
              wrong item) are handled per the <strong>Australian Consumer Law</strong> —
              you're entitled to a remedy: refund, replacement, or repair as appropriate.
              Email us and we'll fix it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">How to request a refund</h2>
            <p>
              Email{" "}
              <a href="mailto:hello@fudaclub.com.au" className="underline">hello@fudaclub.com.au</a>
              {" "}with:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>The email on your FÜDA Club account.</li>
              <li>The date and amount of the charge.</li>
              <li>What went wrong.</li>
            </ul>
            <p className="mt-2">
              We respond within 2 business days. Approved refunds appear on your card
              within 5–10 business days, depending on your bank.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">Disputes &amp; chargebacks</h2>
            <p>
              Please email us first before raising a chargeback with your bank — it's
              faster and we'll usually sort it the same day. Repeated unjustified
              chargebacks may result in account suspension.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
