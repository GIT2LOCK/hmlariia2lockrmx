import { useState } from "react";
import ConversationAssignee from "@/components/ariiatalk/ConversationAssignee";

const staff = [
  { id: 1, nome: "Artur Good QA" },
  { id: 2, nome: "Ewerton QA" },
  { id: 3, nome: "Mariana Nascimento" },
];

export default function AssigneePreview() {
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(2);
  const [c, setC] = useState<number | null>(4);
  return (
    <div className="flex flex-col gap-6 bg-background p-10">
      <div className="flex items-center gap-2">
        <ConversationAssignee staff={staff} value={a} userId={4} onChange={setA} />
        <button className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-muted">Minhas pastas</button>
        <button className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-muted">Abrir chamado</button>
        <button className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-muted">Encerrar</button>
      </div>
      <div className="flex items-center gap-2">
        <ConversationAssignee staff={staff} value={b} valueName={staff[1].nome} userId={4} onChange={setB} />
        <button className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-muted">Minhas pastas</button>
        <button className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-muted">Abrir chamado</button>
        <button className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-muted">Encerrar</button>
      </div>
      <div className="flex items-center gap-2">
        <ConversationAssignee staff={staff} value={c} valueName="Eu Mesmo" userId={4} onChange={setC} />
        <button className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-muted">Minhas pastas</button>
        <button className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-muted">Abrir chamado</button>
        <button className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-muted">Encerrar</button>
      </div>
    </div>
  );
}
