import { Link } from "wouter";

export default function Privacy() {
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
        <h1 className="text-4xl font-black mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: 5 May 2026</p>

        <div className="prose prose-neutral max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold mb-2">1. Who we are</h2>
            <p>
              FÜDA : Global Street Bites operates The FÜDA Club from 9 Searcy St,
              Darwin City NT, Australia. This policy explains what we collect and why,
              under the Privacy Act 1988 (Cth) and the Australian Privacy Principles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. What we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Account info</strong> via Google sign-in: your email, name, and
                profile photo.
              </li>
              <li>
                <strong>Workplace</strong> (optional) so we can apply venue-based free
                delivery.
              </li>
              <li>
                <strong>Order history</strong> — items ordered, dates, amounts, pickup vs
                delivery.
              </li>
              <li>
                <strong>Payment info</strong> is handled by Stripe; we never store card
                numbers ourselves.
              </li>
              <li>
                <strong>Anonymous analytics</strong> (page views, referrers) via our own
                analytics — no third-party trackers.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. How we use it</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To run the service: process orders, issue coins, send your receipts.</li>
              <li>To send you account and billing emails (renewal notices, payment failures).</li>
              <li>To improve the menu and the app based on aggregate usage.</li>
              <li>To prevent fraud and abuse.</li>
            </ul>
            <p className="mt-2">
              We don't sell your data, and we don't share it with third parties for their
              own marketing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. Who we share it with</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Stripe</strong> — for payment processing.</li>
              <li><strong>Google</strong> — for sign-in.</li>
              <li><strong>Square</strong> — to sync our menu catalogue.</li>
              <li><strong>Railway</strong> — our hosting provider.</li>
            </ul>
            <p className="mt-2">
              All of these are bound by their own privacy obligations. We share only what
              the service requires (e.g. Stripe sees your billing details, not your order
              history).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. Your rights</h2>
            <p>
              You can request a copy of your data, ask us to correct it, or delete your
              account at any time. Email{" "}
              <a href="mailto:privacy@fudaclub.com.au" className="underline">privacy@fudaclub.com.au</a>
              {" "}and we'll respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. Retention</h2>
            <p>
              Order history is kept for 7 years to meet ATO record-keeping rules. Account
              data is removed within 30 days of account deletion, except where we're
              legally required to keep it longer.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. Cookies</h2>
            <p>
              We use a single first-party session cookie to keep you logged in. We don't
              use advertising or tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. Changes</h2>
            <p>
              If we materially change this policy we'll email you and update the date at
              the top of this page.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">9. Complaints</h2>
            <p>
              If you're not happy with how we've handled your data you can complain to
              the Office of the Australian Information Commissioner (OAIC) at{" "}
              <a href="https://www.oaic.gov.au" className="underline" target="_blank" rel="noreferrer">oaic.gov.au</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
