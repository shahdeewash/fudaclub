/**
 * Development Login Page
 * Only visible in development mode
 * Allows testing with different user roles without OAuth
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, User, Shield, ChefHat } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function DevLogin() {
  const [, setLocation] = useLocation();
  const { data: devMode } = trpc.dev.isDevMode.useQuery();
  const loginAs = trpc.dev.loginAs.useMutation({
    onSuccess: (data) => {
      toast.success(`Logged in as ${data.user.name} (${data.user.role})`);
      setLocation("/");
    },
    onError: (error) => {
      toast.error(`Login failed: ${error.message}`);
    },
  });

  if (!devMode?.enabled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Development Mode Disabled</CardTitle>
            <CardDescription>
              This page is only available in development mode.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const roles = [
    {
      role: "user" as const,
      title: "Regular User",
      description: "Test customer features: subscription, menu, ordering",
      icon: User,
      color: "text-blue-600",
    },
    {
      role: "admin" as const,
      title: "Admin",
      description: "Test admin dashboard, company management, menu editing",
      icon: Shield,
      color: "text-purple-600",
    },
    {
      role: "kitchen" as const,
      title: "Kitchen Staff",
      description: "Test kitchen display, order status updates, preparation workflow",
      icon: ChefHat,
      color: "text-orange-600",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-6">
        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader>
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <CardTitle className="text-yellow-900 dark:text-yellow-100">
                  Development Mode
                </CardTitle>
                <CardDescription className="text-yellow-700 dark:text-yellow-300">
                  This login page bypasses OAuth for local testing. Select a role to test different features.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          {roles.map(({ role, title, description, icon: Icon, color }) => (
            <Card key={role} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Icon className={`h-8 w-8 ${color}`} />
                  <CardTitle className="text-lg">{title}</CardTitle>
                </div>
                <CardDescription className="text-sm">
                  {description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => loginAs.mutate({ role })}
                  disabled={loginAs.isPending}
                  className="w-full"
                  variant={role === "user" ? "default" : "outline"}
                >
                  {loginAs.isPending ? "Logging in..." : `Login as ${title}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              <strong>Note:</strong> In production, users will log in through Manus OAuth.
              This page will not be accessible.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
