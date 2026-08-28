import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SuggestionGroup } from "@/data/profile-suggestions";
import { cn } from "@/lib/utils";

interface SearchableComboboxProps {
  value?: string | null;
  groups: SuggestionGroup[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function SearchableCombobox({
  value,
  groups,
  placeholder,
  searchPlaceholder,
  disabled,
  onChange,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim();
  const allOptions = useMemo(() => groups.flatMap((group) => group.options), [groups]);
  const hasExactMatch = allOptions.some((option) => option.toLowerCase() === trimmedSearch.toLowerCase());

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
          />
          <CommandList>
            <CommandEmpty>
              {trimmedSearch ? `No suggestion found for "${trimmedSearch}".` : "No suggestions found."}
            </CommandEmpty>
            {trimmedSearch && !hasExactMatch && (
              <CommandGroup heading="Custom">
                <CommandItem value={trimmedSearch} onSelect={() => selectValue(trimmedSearch)}>
                  Use "{trimmedSearch}"
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.options.map((option) => (
                  <CommandItem key={option} value={option} onSelect={() => selectValue(option)}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
