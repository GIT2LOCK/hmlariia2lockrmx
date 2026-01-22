import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogIn, BarChart3, FileText, Users } from "lucide-react";
import logo from "@/assets/logo.png";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--brand-green)/0.08),transparent_50%),radial-gradient(ellipse_at_bottom_right,hsl(var(--brand-blue)/0.08),transparent_50%)]" />
      
      {/* Header */}
      <header className="relative z-10 border-b border-border/50 bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <img src={logo} alt="Web Contador" className="h-10 object-contain" />
          <Button 
            onClick={() => navigate("/auth")}
            className="bg-primary hover:bg-brand-blue-light text-primary-foreground"
          >
            <LogIn className="mr-2 h-4 w-4" />
            Entrar
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
            Gestão contábil{" "}
            <span className="text-secondary">inteligente</span>{" "}
            para sua empresa
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Simplifique sua contabilidade com nossa plataforma moderna e intuitiva. 
            Relatórios automáticos, gestão fiscal e muito mais.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button 
              size="lg"
              onClick={() => navigate("/auth")}
              className="bg-primary hover:bg-brand-blue-light text-primary-foreground font-medium px-8"
            >
              Começar agora
            </Button>
            <Button 
              size="lg"
              variant="outline"
              className="border-border hover:bg-muted"
            >
              Saiba mais
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mt-24 max-w-4xl mx-auto">
          <div className="bg-card p-6 rounded-xl border border-border/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center mb-4">
              <BarChart3 className="h-6 w-6 text-secondary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Relatórios Automáticos</h3>
            <p className="text-muted-foreground text-sm">
              Gere relatórios financeiros completos com apenas um clique.
            </p>
          </div>
          
          <div className="bg-card p-6 rounded-xl border border-border/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Gestão Fiscal</h3>
            <p className="text-muted-foreground text-sm">
              Mantenha suas obrigações fiscais sempre em dia e organizadas.
            </p>
          </div>
          
          <div className="bg-card p-6 rounded-xl border border-border/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-secondary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Multi-empresas</h3>
            <p className="text-muted-foreground text-sm">
              Gerencie múltiplas empresas em uma única plataforma.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
