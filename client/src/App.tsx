import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Subscribe from "./pages/Subscribe";
import Menu from "./pages/Menu";
import Orders from "./pages/Orders";
import Admin from "./pages/Admin";
import AdminDishForm from "./pages/AdminDishForm";
import Kitchen from "./pages/Kitchen";
import Checkout from "./pages/Checkout";
import Payment from "./pages/Payment";
import PaymentSuccess from "./pages/PaymentSuccess";
import SubscriptionSuccess from "./pages/SubscriptionSuccess";
import DevLogin from "./pages/DevLogin";
import FudaClub from "./pages/FudaClub";
import Profile from "./pages/Profile";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/subscribe"} component={Subscribe} />      <Route path={"/menu"} component={Menu} />
      <Route path={"/checkout"} component={Checkout} />
      <Route path={"/payment"} component={Payment} />
      <Route path={"/payment-success"} component={PaymentSuccess} />
      <Route path={"/subscription-success"} component={SubscriptionSuccess} />
      <Route path={"/dev-login"} component={DevLogin} />
      <Route path={"/fuda-club"} component={FudaClub} />
      <Route path={"/profile"} component={Profile} />
      <Route path={"/orders"} component={Orders} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/admin/dish/new"} component={AdminDishForm} />
      <Route path={"/kitchen"} component={Kitchen} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
