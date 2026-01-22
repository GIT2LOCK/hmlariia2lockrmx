import { Check, X } from "lucide-react";

interface PasswordChecklistProps {
  password: string;
}

const PasswordChecklist = ({ password }: PasswordChecklistProps) => {
  const requirements = [
    { label: "Mínimo 8 caracteres", valid: password.length >= 8 },
    { label: "Uma letra minúscula", valid: /[a-z]/.test(password) },
    { label: "Uma letra maiúscula", valid: /[A-Z]/.test(password) },
    { label: "Um número", valid: /[0-9]/.test(password) },
    { label: "Um caractere especial (!@#$%^&*)", valid: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  return (
    <div className="space-y-1.5 text-xs">
      {requirements.map((req, index) => (
        <div
          key={index}
          className={`flex items-center gap-2 transition-colors duration-200 ${
            req.valid ? "text-secondary" : "text-muted-foreground"
          }`}
        >
          {req.valid ? (
            <Check className="h-3.5 w-3.5 text-secondary" />
          ) : (
            <X className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
          <span>{req.label}</span>
        </div>
      ))}
    </div>
  );
};

export default PasswordChecklist;
