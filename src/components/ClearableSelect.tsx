import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface ClearableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  defaultValue?: string;
  className?: string;
}

export function ClearableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Selecionar",
  defaultValue = "todos",
  className,
}: ClearableSelectProps) {
  const showClearButton = value !== defaultValue;

  return (
    <div className={cn("relative flex items-center gap-1", className)}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto z-50 bg-popover">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showClearButton && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onValueChange(defaultValue);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
