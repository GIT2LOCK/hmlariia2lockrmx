import { UserRound, UserRoundPlus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Staff = { id: number; nome: string };

type Props = {
  staff: Staff[];
  value: number | null;
  valueName?: string | null;
  userId?: number;
  disabled?: boolean;
  onChange: (responsavelId: number | null) => void;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return text || "?";
}

export default function ConversationAssignee({
  staff,
  value,
  valueName,
  userId,
  disabled,
  onChange,
}: Props) {
  const assigned = value !== null;
  const name = valueName || staff.find((s) => s.id === value)?.nome || "Sem responsável";
  const isMine = !!userId && value === userId;
  const userNotInStaff = !!userId && !staff.some((s) => s.id === userId);


  return (
    <div
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border pl-1 pr-0.5 transition-colors",
        assigned
          ? "border-primary/25 bg-primary/5"
          : "border-dashed border-border bg-muted/40",
      )}
      title="Técnico responsável (visível só para a equipe)"
    >
      <Avatar className="h-6 w-6 shrink-0 border border-background">
        <AvatarFallback
          className={cn(
            "text-[10px] font-bold tracking-tight",
            assigned ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {assigned ? initials(name) : <UserRound className="h-3.5 w-3.5" />}
        </AvatarFallback>
      </Avatar>

      <Select
        value={value === null ? "none" : String(value)}
        disabled={disabled}
        onValueChange={(next) => onChange(next === "none" ? null : Number(next))}
      >
        <SelectTrigger
          aria-label="Técnico responsável"
          className={cn(
            "h-7 w-auto min-w-[7.5rem] gap-1.5 border-0 bg-transparent px-1 py-0 text-sm shadow-none",
            "focus:ring-0 focus-visible:ring-0",
            "[&>span]:line-clamp-1",
            assigned ? "font-semibold text-primary" : "font-medium text-muted-foreground",
          )}
        >
          <SelectValue placeholder="Sem responsável" />
        </SelectTrigger>
        <SelectContent align="end" className="min-w-[15rem]">
          <SelectItem value="none" className="text-muted-foreground">
            <span className="flex items-center gap-2">
              <UserRound className="h-3.5 w-3.5 shrink-0 opacity-60" />
              Sem responsável
            </span>
          </SelectItem>
          {staff.length > 0 && <div className="my-1 h-px bg-border" />}
          {userNotInStaff && (
            <SelectItem value={String(userId)} className="font-medium">
              <span className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="bg-primary/15 text-[9px] font-bold text-primary">EU</AvatarFallback>
                </Avatar>
                Eu
              </span>
            </SelectItem>
          )}
          {staff.map((s) => (
            <SelectItem key={s.id} value={String(s.id)} className="font-medium">
              <span className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarFallback
                    className={cn(
                      "text-[9px] font-bold",
                      s.id === userId ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {initials(s.nome)}
                  </AvatarFallback>
                </Avatar>
                {s.nome}
                {s.id === userId ? " (você)" : ""}
              </span>
            </SelectItem>
          ))}

        </SelectContent>
      </Select>

      {!isMine && !!userId && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(userId)}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded border border-primary/25 bg-background px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          <UserRoundPlus className="h-3 w-3" />
          Mim
        </button>
      )}
    </div>
  );
}
