import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, BookOpen, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface KnowbaseItem {
  id: number;
  name: string;
  answer?: string;
  date?: string;
  date_mod?: string;
}

interface SearchResult {
  data?: Record<string, { 2: number; 6: string; 7: string; 3: string }>; 
  totalcount?: number;
  count?: number;
}

export default function BaseConhecimento() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<KnowbaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowbaseItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchArticles = async (searchTerm: string, pageNum: number) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const params: Record<string, string> = { page: String(pageNum) };
      if (searchTerm.trim()) {
        params.action = "search";
        params.search = searchTerm.trim();
      } else {
        params.action = "list";
      }

      // Build URL with query params for GET-style invocation

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const queryString = new URLSearchParams(params).toString();
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/glpi-proxy?${queryString}`,
        {
          headers: {
            "Authorization": `Bearer ${anonKey}`,
            "apikey": anonKey,
          },
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${res.status}`);
      }

      const result = await res.json();

      if (searchTerm.trim() && result.data) {
        // Search result format
        const mapped = Object.values(result.data).map((item: any) => ({
          id: item["2"],
          name: item["6"],
          answer: item["7"],
          date: item["3"],
        }));
        setItems(mapped);
        setTotalCount(result.totalcount || mapped.length);
      } else if (Array.isArray(result)) {
        setItems(result);
        setTotalCount(result.length >= 20 ? (pageNum * 20) + 1 : pageNum * 20);
      } else {
        setItems([]);
        setTotalCount(0);
      }
    } catch (e: any) {
      console.error("Erro ao buscar artigos:", e);
      toast({ title: "Erro ao buscar artigos do GLPI", description: e.message, variant: "destructive" });
      setItems([]);
    }
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchArticles(search, 1);
  };

  const decodeHtmlEntities = (html: string) => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = html;
    return textarea.value;
  };

  const openArticle = async (item: KnowbaseItem) => {
    setDetailLoading(true);
    setSelectedItem({ ...item, answer: "" });
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/glpi-proxy?action=get&id=${item.id}`,
        {
          headers: {
            "Authorization": `Bearer ${anonKey}`,
            "apikey": anonKey,
          },
        }
      );
      const detail = await res.json();
      const answer = decodeHtmlEntities(detail.answer || "");
      setSelectedItem({ id: detail.id, name: detail.name, answer, date: detail.date_mod || detail.date });
    } catch {
      toast({ title: "Erro ao carregar artigo", variant: "destructive" });
    }
    setDetailLoading(false);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchArticles(search, newPage);
  };

  const stripHtml = (html: string) => {
    if (!html) return "";
    // Decode HTML entities first, then strip tags
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Base de Conhecimento</h1>
        <p className="text-muted-foreground">Consulte artigos da base de conhecimento do GLPI</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar artigos..."
            className="pl-10"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
        </Button>
      </form>

      {!hasSearched && (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Pesquise ou clique em "Buscar" para listar os artigos da base de conhecimento.</p>
        </div>
      )}

      {hasSearched && !loading && items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhum artigo encontrado.</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="grid gap-3">
            {items.map((item) => (
              <Card
                key={item.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openArticle(item)}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-foreground truncate">{item.name}</h3>
                      {item.answer && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {stripHtml(item.answer).substring(0, 200)}
                        </p>
                      )}
                    </div>
                    {item.date && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(item.date).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Página {page}</span>
            <Button variant="outline" size="sm" disabled={items.length < 20} onClick={() => handlePageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(o) => !o && setSelectedItem(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedItem?.name}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div
              className="prose prose-sm dark:prose-invert max-w-none [&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_img]:max-w-full [&_img]:h-auto [&_a]:text-primary [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: selectedItem?.answer || "" }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
