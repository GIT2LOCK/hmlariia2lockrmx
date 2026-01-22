import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const Tasks = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Tasks</h2>
          <p className="text-muted-foreground">Gerencie suas tarefas</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Task
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Nenhuma task cadastrada ainda.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Tasks;
