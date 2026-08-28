import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Plan {
  id: string;
  name: string;
  price: number;
  credits: number;
  features: string[];
}

type CreditsState = {
  creditsRemaining: number;
  creditsAllocated?: number;
  hasSubscription: boolean;
  planType?: string | null;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
};

type PendingAction = {
  plan: Plan;
  kind: "subscribe" | "upgrade";
};

function cacheSubscription(subscription: {
  creditsRemaining: number;
  creditsAllocated?: number;
  active?: boolean;
  planType: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}) {
  queryClient.setQueryData(["/api/credits"], {
    creditsRemaining: subscription.creditsRemaining,
    creditsAllocated: subscription.creditsAllocated ?? 0,
    hasSubscription: subscription.active !== false,
    planType: subscription.planType,
    status: subscription.active === false ? "Inactive" : "Active",
    startDate: subscription.startDate ?? null,
    endDate: subscription.endDate ?? null,
  });
  queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
}

function formatRupees(priceInPaise: number) {
  return `₹${(priceInPaise / 100).toLocaleString()}`;
}

export default function SubscriptionPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/subscription/plans"],
  });
  const { data: credits } = useQuery<CreditsState>({
    queryKey: ["/api/credits"],
  });

  const hasActiveSubscription = Boolean(credits?.hasSubscription);
  const currentPlan = credits?.planType || null;
  const isConfirmOpen = Boolean(pendingAction);

  const subscribeMutation = useMutation({
    mutationFn: async (planType: string) => {
      const res = await apiRequest("POST", "/api/subscription/subscribe", {
        planType,
        simulatedPayment: true,
      });
      return res.json();
    },
    onSuccess: (subscription) => {
      cacheSubscription(subscription);
      setPendingAction(null);
      toast({
        title: "Simulated payment successful",
        description: `${subscription.planType} is now active with ${subscription.creditsRemaining} credits. No real payment was charged.`,
      });
      setLocation("/profile");
    },
    onError: (error: Error) => {
      toast({
        title: "Subscription Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscription/upgrade", {
        planType: "Premium",
        simulatedPayment: true,
      });
      return res.json();
    },
    onSuccess: (subscription) => {
      cacheSubscription(subscription);
      setPendingAction(null);
      toast({
        title: "Upgrade successful",
        description: `Premium is now active. Unused credits were kept and ${subscription.additionalCredits || 500} Premium credits were added. No real payment was charged.`,
      });
      setLocation("/profile");
    },
    onError: (error: Error) => {
      toast({
        title: "Upgrade Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isPending = subscribeMutation.isPending || upgradeMutation.isPending;

  const getPlanButtonLabel = (plan: Plan) => {
    if (!hasActiveSubscription) return `Select ${plan.name}`;
    if (currentPlan === plan.name) return "Current Plan";
    if (currentPlan === "Basic" && plan.name === "Premium") return "Upgrade to Premium";
    return "Not available";
  };

  const canChoosePlan = (plan: Plan) => {
    if (isPending) return false;
    if (!hasActiveSubscription) return true;
    return currentPlan === "Basic" && plan.name === "Premium";
  };

  const handlePlanClick = (plan: Plan) => {
    if (!canChoosePlan(plan)) return;
    setPendingAction({
      plan,
      kind: hasActiveSubscription ? "upgrade" : "subscribe",
    });
  };

  const handleConfirm = () => {
    if (!pendingAction || isPending) return;
    if (pendingAction.kind === "upgrade") {
      upgradeMutation.mutate();
      return;
    }
    subscribeMutation.mutate(pendingAction.plan.name);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <div className="page-container">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="mb-8 flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl text-balance">Choose Your Plan</h2>
          <p className="mt-4 text-lg text-gray-600">
            Select a subscription to start building your professional profile. Payment is simulated for this assignment.
          </p>
        </div>

        <Card className={`max-w-4xl mx-auto mb-8 ${hasActiveSubscription ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"}`}>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Current plan</p>
                <p className="font-medium text-gray-900">{currentPlan || "None"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Credits remaining</p>
                <p className="font-medium text-gray-900">{credits?.creditsRemaining ?? 0}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Initial allocation</p>
                <p className="font-medium text-gray-900">{credits?.creditsAllocated || (currentPlan === "Premium" ? 1000 : currentPlan === "Basic" ? 500 : "—")}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Subscription status</p>
                <p className="font-medium text-gray-900">{hasActiveSubscription ? "Active" : "Inactive"}</p>
              </div>
            </div>
            {hasActiveSubscription ? (
              <p className="mt-3 text-center text-sm text-green-700">
                Buy Credits adds 100 credits for ₹500 and does not change this plan.
              </p>
            ) : (
              <p className="mt-3 text-center text-sm text-gray-600">
                Choose Basic or Premium, then confirm the simulated payment to unlock the profile builder.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-2 max-w-4xl mx-auto">
          {plans?.map((plan) => {
            const isCurrent = hasActiveSubscription && currentPlan === plan.name;
            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden ${
                  isCurrent
                    ? "border-2 border-green-600 shadow-lg"
                    : plan.id === "premium"
                      ? "border-2 border-primary shadow-lg"
                      : ""
                }`}
              >
                {plan.id === "premium" && !isCurrent && (
                  <div className="absolute top-0 right-0">
                    <Badge className="bg-primary text-white rounded-none rounded-bl-lg px-3 py-1">
                      POPULAR
                    </Badge>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute top-0 right-0">
                    <Badge className="bg-green-600 text-white rounded-none rounded-bl-lg px-3 py-1">
                      CURRENT PLAN
                    </Badge>
                  </div>
                )}

                <CardContent className="p-6 sm:p-8">
                  <div className="text-center">
                    <h3 className="text-2xl font-semibold text-gray-900 mb-4">{plan.name}</h3>
                    <p className="text-gray-600 mb-8">
                      {plan.id === "basic"
                        ? "Perfect for getting started with professional profiles"
                        : "Best value for power users who edit frequently"}
                    </p>

                    <div className="mb-8">
                      <div className="flex flex-wrap items-baseline justify-center">
                        <span className="text-4xl font-bold text-gray-900 sm:text-5xl">
                          {formatRupees(plan.price)}
                        </span>
                        <span className="ml-1 text-lg text-gray-500 sm:text-xl">/ 30 days</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">{plan.credits} credits included</p>
                      <p className="mt-1 text-xs text-gray-400">No automatic renewal. Assignment simulation only.</p>
                    </div>

                    <ul className="text-left space-y-4 mb-8">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <Check className="h-5 w-5 text-accent mt-0.5 mr-3 flex-shrink-0" />
                          <span className="text-gray-600">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={() => handlePlanClick(plan)}
                      disabled={!canChoosePlan(plan)}
                      className="w-full"
                      variant={plan.id === "premium" ? "default" : "outline"}
                    >
                      {isPending && pendingAction?.plan.id === plan.id && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {getPlanButtonLabel(plan)}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-12 space-y-2">
          <p className="text-sm text-gray-500">
            Profile edits consume 5 credits each. PDF export and profile sharing do not consume credits.
          </p>
          <p className="text-sm text-gray-500">
            Top-up is a separate action: ₹500 adds 100 credits and does not change your plan.
          </p>
        </div>
      </div>

      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isPending) setPendingAction(null);
        }}
      >
        <DialogContent className="max-h-[min(90dvh,40rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.kind === "upgrade" ? "Upgrade to Premium" : `Confirm ${pendingAction?.plan.name} plan`}
            </DialogTitle>
            <DialogDescription>
              This is a simulated assignment payment. No real payment will be processed.
            </DialogDescription>
          </DialogHeader>
          {pendingAction && (
            <div className="space-y-4">
              <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-700 space-y-1">
                <p><span className="font-medium">Plan:</span> {pendingAction.plan.name}</p>
                <p><span className="font-medium">Price:</span> {formatRupees(pendingAction.plan.price)}</p>
                <p><span className="font-medium">Included credits:</span> {pendingAction.plan.credits}</p>
                <p><span className="font-medium">Access period:</span> 30 days, no automatic renewal</p>
                {pendingAction.kind === "upgrade" ? (
                  <p>Unused Basic credits are kept. Premium adds 500 extra included credits. This is not a credit top-up.</p>
                ) : (
                  <p>After confirmation, this plan becomes active and you can enter the profile builder.</p>
                )}
              </div>
              <Button onClick={handleConfirm} disabled={isPending} className="w-full">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simulate Payment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
