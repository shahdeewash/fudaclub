import { Link, useLocation } from "wouter";

/**
 * Site footer with legal links + business identity.
 *
 * Hidden on staff-facing pages (admin, kitchen) and on payment-flow screens
 * where it would visually compete with the primary action. Otherwise renders
 * sitewide so Stripe, the ATO, and Australian Consumer Law have somewhere to
 * point users for terms / privacy / refund policy.
 */
const HIDDEN_PATH_PREFIXES = [
  "/admin",
  "/kitchen",
  "/dev-login",
  "/payment",          // also covers /payment-success
  "/subscription-success",
];

export function Footer() {
  const [location] = useLocation();
  if (HIDDEN_PATH_PREFIXES.some(p => location === p || location.startsWith(p + "/"))) {
    return null;
  }
  // Special case: /payment-success doesn't start with /payment/ — handle explicitly.
  if (location === "/payment-success") return null;

  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#1A1A1A] text-white/70 text-sm">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand + address */}
          <div>
            <div className="text-2xl font-black text-[#C9A84C] mb-3">
              FÜDA <span className="text-sm font-normal text-white/50">Club</span>
            </div>
            <p className="mb-1">9 Searcy St, Darwin City NT</p>
            <p className="text-white/50">Sun–Thu 10am–10pm · Fri–Sat 10am–1am</p>
          </div>

          {/* Legal */}
          <div>
            <div className="text-xs uppercase tracking-widest text-white/50 font-bold mb-3">Legal</div>
            <ul className="space-y-2">
              <li>
                <Link href="/terms"><a className="hover:text-white">Terms of Service</a></Link>
              </li>
              <li>
                <Link href="/privacy"><a className="hover:text-white">Privacy Policy</a></Link>
              </li>
              <li>
                <Link href="/refunds"><a className="hover:text-white">Refunds &amp; Cancellation</a></Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <div className="text-xs uppercase tracking-widest text-white/50 font-bold mb-3">Get in touch</div>
            <ul className="space-y-2">
              <li>
                <a href="mailto:hello@fudaclub.com.au" className="hover:text-white">hello@fudaclub.com.au</a>
              </li>
              <li>
                <Link href="/profile"><a className="hover:text-white">Manage subscription</a></Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between text-white/40 text-xs">
          <div>© {year} FÜDA : Global Street Bites · Darwin, NT, Australia</div>
          <div>Payments by Stripe · Sign-in by Google</div>
        </div>
      </div>
    </footer>
  );
}
