import { Link } from "wouter";

export default function Terms() {
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
        <h1 className="text-4xl font-black mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: 5 May 2026</p>

        <div className="prose prose-neutral max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold mb-2">1. About these terms</h2>
            <p>
              These terms govern your use of The FÜDA Club, a recurring meal-subscription
              service operated by FÜDA : Global Street Bites at 9 Searcy St, Darwin City NT,
              Australia. By signing up you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. Subscription &amp; billing</h2>
            <p>
              The FÜDA Club bills automatically on the cadence you choose at signup
              (7-day trial at A$80 then A$180/fortnight, A$180/fortnight, or A$350/month).
              Billing is processed by Stripe. You authorise FÜDA to charge the payment
              method you provide on each renewal until you cancel.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. Cancellation</h2>
            <p>
              You can cancel any time from your <Link href="/profile"><a className="underline">Profile</a></Link> page.
              Your benefits continue until the end of the period you've already paid for; we
              don't pro-rate or refund unused portions of a current period. See our{" "}
              <Link href="/refunds"><a className="underline">refunds policy</a></Link> for details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. FÜDA Coins &amp; member discount</h2>
            <p>
              Active members receive 1 FÜDA Coin per working day (Mon–Sat) plus 10% off
              every order. Coins expire weekly and aren't redeemable for cash. The 10%
              discount and coin redemption are excluded on certain items (Mix Grill, Combo
              Meals, weekly deals) — these are flagged in the menu.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. Founding pricing</h2>
            <p>
              The first 50 members lock in launch pricing for 12 months from signup. After
              that 12-month window, prices may increase to the post-launch rate. Founding
              status is non-transferable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. Delivery &amp; pickup</h2>
            <p>
              Free delivery is unlocked for venues with 5+ active members. Otherwise
              delivery is A$10 (subject to a A$15 minimum order). Pickup is always free
              from our Searcy St location.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. Conduct &amp; account</h2>
            <p>
              You're responsible for keeping your login secure. We may suspend accounts
              that abuse the service (e.g. fraudulent chargebacks, sharing logins, abusing
              the referral system).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. Changes to these terms</h2>
            <p>
              We may update these terms from time to time. Material changes (e.g. pricing)
              will be communicated by email at least 14 days in advance. Continued use of
              the service after changes take effect means you accept them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">9. Contact</h2>
            <p>
              Questions about these terms? Email{" "}
              <a href="mailto:hello@fudaclub.com.au" className="underline">hello@fudaclub.com.au</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
