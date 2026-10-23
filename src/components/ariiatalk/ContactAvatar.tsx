import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

type Props = { name: string; photoUrl?: string | null; contactId?: number | null; conversationId?: string; className?: string };

export default function ContactAvatar({ name, photoUrl, contactId, conversationId, className }: Props) {
  const { user } = useUser();
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "100px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const photo = useQuery({
    queryKey: ["ariiatalk-photo", user?.id, conversationId ?? null, contactId ?? null],
    enabled: visible && !!user?.id && !!(conversationId || contactId),
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ariiatalk-conversas", {
        body: { action: "get_profile_picture", ...(conversationId ? { conversation_id: conversationId } : { contact_id: contactId }) },
      });
      if (error || data?.error) throw new Error("photo_unavailable");
      return { url: typeof data?.photo_url === "string" ? data.photo_url : null };
    },
  });
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
  return <Avatar ref={ref} className={className}>
    <AvatarImage src={photo.data ? photo.data.url ?? undefined : photoUrl ?? undefined} alt={`Foto de ${name}`} className="object-cover" referrerPolicy="no-referrer" />
    <AvatarFallback className="text-xs font-semibold text-muted-foreground">{initials}</AvatarFallback>
  </Avatar>;
}