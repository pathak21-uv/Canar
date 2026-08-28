import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Route } from "wouter";

type CreditsState = {
  creditsRemaining: number;
  hasSubscription: boolean;
  planType?: string | null;
  status?: string;
};

export function ProtectedRoute({
  path,
  component: Component,
  requireSubscription = false,
}: {
  path: string;
  component: () => React.JSX.Element;
  requireSubscription?: boolean;
}) {
  const { user, isLoading } = useAuth();
  const {
    data: credits,
    isLoading: isCreditsLoading,
    isError: isCreditsError,
  } = useQuery<CreditsState>({
    queryKey: ["/api/credits"],
    enabled: !!user && requireSubscription,
  });

  if (isLoading || (!!user && requireSubscription && isCreditsLoading)) {
    return (
      <Route path={path}>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  if (requireSubscription && isCreditsError) {
    return (
      <Route path={path}>
        <div className="min-h-screen flex items-center justify-center px-4">
          <p className="text-sm text-gray-600">Unable to verify subscription. Please refresh the page.</p>
        </div>
      </Route>
    );
  }

  if (requireSubscription && !credits?.hasSubscription) {
    return (
      <Route path={path}>
        <Redirect to="/subscription" />
      </Route>
    );
  }

  return (
    <Route path={path}>
      <Component />
    </Route>
  );
}
