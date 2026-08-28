import { Button } from "@/components/ui/button";
import { Coins, Plus } from "lucide-react";

interface CreditCounterProps {
  credits: number;
  planType?: string | null;
  onClick?: () => void;
  showBuyButton?: boolean;
}

export function CreditCounter({ credits, planType, onClick, showBuyButton = true }: CreditCounterProps) {
  return (
    <div className="flex min-w-0 items-center space-x-3">
      <div className="flex min-w-0 items-center whitespace-nowrap rounded-full bg-gray-100 px-3 py-2 sm:px-4">
        <Coins className="h-4 w-4 text-warning mr-2" />
        <span className="font-medium text-gray-900">{credits}</span>
        <span className="text-sm text-gray-600 ml-1">credits</span>
        {planType ? (
          <span className="text-sm text-gray-500 ml-1">· {planType}</span>
        ) : null}
      </div>
      {showBuyButton && onClick && (
        <Button
          onClick={onClick}
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Buy Credits
        </Button>
      )}
    </div>
  );
}
