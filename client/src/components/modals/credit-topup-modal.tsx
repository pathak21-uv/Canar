import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Coins, CreditCard, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface CreditTopupModalProps {
  open: boolean;
  onClose: () => void;
  currentCredits: number;
  planType?: string | null;
  hasSubscription?: boolean;
}

const TOPUP_CREDITS = 100;
const TOPUP_RUPEES = 500;

export function CreditTopupModal({
  open,
  onClose,
  currentCredits,
  planType,
  hasSubscription = false,
}: CreditTopupModalProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTopup = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const response = await apiRequest("POST", "/api/subscription/credits/topup", {
        simulatedPayment: true,
      });
      const result = await response.json();
      queryClient.setQueryData(["/api/credits"], (current: any) => ({
        ...(current || {}),
        creditsRemaining: result.creditsRemaining,
        hasSubscription: current?.hasSubscription ?? true,
        planType: result.planType || current?.planType || planType,
        status: "Active",
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });

      toast({
        title: "Credits Added",
        description: `${result.credits} credits were added. Your ${result.planType || planType || "current"} plan is unchanged. Payment is simulated for this assignment.`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Top-up Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isProcessing && !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Buy Credits
          </DialogTitle>
          <DialogDescription>
            {hasSubscription
              ? `Add ${TOPUP_CREDITS} credits for ₹${TOPUP_RUPEES}. This does not change your ${planType || "current"} subscription.`
              : "Credit top-up is only available after you activate a subscription."}
          </DialogDescription>
        </DialogHeader>

        {!hasSubscription ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Buying credits cannot activate Basic or Premium. Choose a plan first.
            </p>
            <Button className="w-full" onClick={() => { onClose(); setLocation("/subscription"); }}>
              Go to Subscription
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              You currently have {currentCredits} credits remaining. Each profile edit costs 5 credits.
            </p>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Zap className="h-5 w-5 text-yellow-500" />
                      {TOPUP_CREDITS} Credits
                    </CardTitle>
                    <p className="text-sm text-gray-600 mt-1">Adds 20 profile edits</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">₹{TOPUP_RUPEES.toLocaleString()}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    Does not change your {planType || "current"} plan
                  </span>
                  <Button
                    size="sm"
                    disabled={isProcessing}
                    onClick={handleTopup}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    {isProcessing ? "Processing..." : "Simulate Top-up"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="text-xs text-gray-500 text-center pt-2">
              This is a simulated assignment payment. The server records exactly ₹500 for 100 credits.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
