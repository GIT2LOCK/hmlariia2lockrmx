import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useUser } from "@/contexts/UserContext";
import { getAuthHeaders } from "@/services/authService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  User, Shield, Monitor, Pencil, Camera, Save, X, Loader2,
  Smartphone, Globe, Clock, Trash2, Lock, Eye, EyeOff, Copy, Check, Mail,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ProfileData {
  nome: string;
  email: string;
  telefone: string;
  avatar_url: string;
  totp_enabled: boolean;
  permissao: string;
  assinatura_email_url: string;
}

interface SessionData {
  id: number;
  ip_address: string | null;
  user_agent: string | null;
  criado_em: string | null;
  last_activity: string | null;
  is_current: boolean;
}

const parseUserAgent = (ua: string | null) => {
  if (!ua) return { browser: "Desconhecido", os: "Desconhecido", device: "desktop" };
  const browser = ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" :
    ua.includes("Safari") ? "Safari" : ua.includes("Edge") ? "Edge" : "Outro";
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" :
    ua.includes("Linux") ? "Linux" : ua.includes("Android") ? "Android" :
    ua.includes("iPhone") ? "iOS" : "Outro";
  const device = ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone") ? "mobile" : "desktop";
  return { browser, os, device };
};

const formatDate = (date: string | null) => {
  if (!date) return "-";
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const MeuPerfil = () => {
  const { user, updateAvatar, syncFromDatabase, isLoading, isAuthenticated } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ nome: "", email: "", telefone: "", assinatura_email_url: "" });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password change
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
  const [savingPassword, setSavingPassword] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // 2FA
  const [setup2FAOpen, setSetup2FAOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret2FA, setSecret2FA] = useState("");
  const [code2FA, setCode2FA] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [copied2FA, setCopied2FA] = useState(false);
  const [disabling2FA, setDisabling2FA] = useState(false);

  const getCurrentUserId = () => {
    if (user.id > 0) return user.id;
    try {
      const storedUser = JSON.parse(localStorage.getItem("auth_user") || "{}");
      return Number(storedUser?.id || 0);
    } catch {
      return 0;
    }
  };

  const hasValidSessionToken = async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) return false;

    const { data: session } = await supabase
      .from("sessions")
      .select("expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!session?.expires_at) return false;
    return new Date(session.expires_at) > new Date();
  };

  const callProfileAPI = async (body: any) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/update-profile`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      return data;
    } catch {
      return { success: false, error: "Falha na conexão" };
    }
  };

  const loadProfile = async () => {
    const resolvedUserId = getCurrentUserId();
    if (!resolvedUserId) return;

    const canUseEdge = await hasValidSessionToken();
    if (canUseEdge) {
      const data = await callProfileAPI({ action: "get-profile" });
      if (data.success) {
        setProfile(data.user);
        setEditForm({
          nome: data.user.nome || "",
          email: data.user.email || "",
          telefone: data.user.telefone || "",
          assinatura_email_url: data.user.assinatura_email_url || "",
        });
        if (data.user.avatar_url) updateAvatar(data.user.avatar_url);
        return;
      }
    }

    // Fallback: load profile directly from database
    const { data: dbUser } = await supabase
      .from("usuarios")
      .select("id, nome, email, permissao, telefone, avatar_url, totp_enabled, assinatura_email_url")
      .eq("id", resolvedUserId)
      .single();

    if (dbUser) {
      setProfile({
        nome: dbUser.nome,
        email: dbUser.email,
        telefone: dbUser.telefone || "",
        avatar_url: dbUser.avatar_url || "",
        totp_enabled: dbUser.totp_enabled || false,
        permissao: dbUser.permissao,
        assinatura_email_url: (dbUser as any).assinatura_email_url || "",
      });
      setEditForm({
        nome: dbUser.nome || "",
        email: dbUser.email || "",
        telefone: dbUser.telefone || "",
        assinatura_email_url: (dbUser as any).assinatura_email_url || "",
      });
      if (dbUser.avatar_url) updateAvatar(dbUser.avatar_url);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);

    const resolvedUserId = getCurrentUserId();
    if (!resolvedUserId) {
      setSessions([]);
      setLoadingSessions(false);
      return;
    }

    const canUseEdge = await hasValidSessionToken();
    if (canUseEdge) {
      const data = await callProfileAPI({ action: "get-sessions" });
      if (data.success) {
        setSessions(data.sessions);
        setLoadingSessions(false);
        return;
      }
    }

    // Fallback: load sessions directly from database
    const currentToken = localStorage.getItem("auth_token");
    const { data: sessionsData } = await supabase
      .from("sessions")
      .select("id, ip_address, user_agent, criado_em, last_activity, expires_at")
      .eq("user_id", resolvedUserId)
      .order("last_activity", { ascending: false });

    const { data: currentSession } = currentToken
      ? await supabase.from("sessions").select("id").eq("token", currentToken).maybeSingle()
      : { data: null };

    setSessions(
      (sessionsData || []).map((s: any) => ({
        ...s,
        is_current: s.id === currentSession?.id,
      }))
    );
    setLoadingSessions(false);
  };

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    loadProfile();
  }, [isLoading, isAuthenticated, user.id]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Apenas imagens são permitidas", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagem deve ter no máximo 2MB", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `user-${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatar_url = urlData.publicUrl;

      await callProfileAPI({ action: "update-info", avatar_url });
      updateAvatar(avatar_url);
      setProfile(prev => prev ? { ...prev, avatar_url } : prev);
      toast({ title: "Foto atualizada!" });
    } catch (err) {
      toast({ title: "Erro ao enviar foto", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!editForm.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const data = await callProfileAPI({ action: "update-info", ...editForm });
    if (data.success) {
      setProfile(data.user);
      setEditing(false);
      toast({ title: "Dados atualizados!" });
      // Update stored user
      const storedUser = localStorage.getItem("auth_user");
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        parsed.nome = editForm.nome;
        parsed.email = editForm.email;
        localStorage.setItem("auth_user", JSON.stringify(parsed));
      }
      syncFromDatabase();
    } else {
      toast({ title: data.error || "Erro ao salvar", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (passwordForm.new !== passwordForm.confirm) {
      toast({ title: "As senhas não coincidem", variant: "destructive" });
      return;
    }
    if (passwordForm.new.length < 8) {
      toast({ title: "A nova senha deve ter no mínimo 8 caracteres", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    const data = await callProfileAPI({
      action: "change-password",
      current_password: passwordForm.current,
      new_password: passwordForm.new,
    });
    if (data.success) {
      toast({ title: "Senha alterada com sucesso!" });
      setChangingPassword(false);
      setPasswordForm({ current: "", new: "", confirm: "" });
    } else {
      toast({ title: data.error || "Erro ao alterar senha", variant: "destructive" });
    }
    setSavingPassword(false);
  };

  const handleRevokeSession = async (sessionId: number) => {
    const data = await callProfileAPI({ action: "revoke-session", session_id: sessionId });
    if (data.success) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      toast({ title: "Sessão encerrada" });
    }
  };

  const handleSetup2FA = async () => {
    setSetup2FAOpen(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/setup-2fa`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data.success) {
        setQrCodeUrl(data.qrCodeUrl);
        setSecret2FA(data.secret);
      }
    } catch {
      toast({ title: "Erro ao configurar 2FA", variant: "destructive" });
    }
  };

  const handleVerify2FA = async () => {
    if (code2FA.length !== 6) return;
    setVerifying2FA(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify({ userId: user.id, code: code2FA, isSetup: true }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "2FA ativado!" });
        setSetup2FAOpen(false);
        setCode2FA("");
        loadProfile();
      } else {
        toast({ title: "Código inválido", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro na verificação", variant: "destructive" });
    } finally {
      setVerifying2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!confirm("Deseja realmente desativar o 2FA?")) return;
    setDisabling2FA(true);
    const data = await callProfileAPI({ action: "disable-2fa" });
    if (data.success) {
      toast({ title: "2FA desativado" });
      loadProfile();
    }
    setDisabling2FA(false);
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret2FA);
    setCopied2FA(true);
    setTimeout(() => setCopied2FA(false), 2000);
  };

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const roleLabels: Record<string, string> = {
    SUPERADMIN: "Super Administrador",
    ADMIN: "Administrador",
    USER: "Usuário",
    VIEWER: "Visualizador",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold text-foreground">Meu Perfil</h2>

      <Tabs defaultValue="info" onValueChange={(v) => { if (v === "sessions") loadSessions(); }}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="info" className="gap-2"><User className="h-4 w-4" /> Dados Pessoais</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Shield className="h-4 w-4" /> Segurança</TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2"><Monitor className="h-4 w-4" /> Dispositivos</TabsTrigger>
        </TabsList>

        {/* TAB: Dados Pessoais */}
        <TabsContent value="info" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2"><User className="h-5 w-5" /> Informações Pessoais</span>
                {!editing ? (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-2">
                    <Pencil className="h-4 w-4" /> Editar
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditForm({ nome: profile.nome, email: profile.email, telefone: profile.telefone || "", assinatura_email_url: profile.assinatura_email_url || "" }); }}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={handleSaveInfo} disabled={saving} className="gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profile.avatar_url || user.avatar} />
                    <AvatarFallback className="text-xl">{profile.nome?.[0]}</AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <Camera className="h-6 w-6 text-white" />
                    )}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </div>
                <div>
                  <p className="text-lg font-semibold">{profile.nome}</p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                  <Badge variant="secondary" className="mt-1">{roleLabels[profile.permissao] || profile.permissao}</Badge>
                </div>
              </div>

              <Separator />

              {/* Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome completo</Label>
                  {editing ? (
                    <Input value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} />
                  ) : (
                    <p className="text-sm mt-1 p-2 bg-muted/50 rounded">{profile.nome}</p>
                  )}
                </div>
                <div>
                  <Label>E-mail</Label>
                  {editing ? (
                    <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} type="email" />
                  ) : (
                    <p className="text-sm mt-1 p-2 bg-muted/50 rounded">{profile.email}</p>
                  )}
                </div>
                <div>
                  <Label>Telefone</Label>
                  {editing ? (
                    <Input value={editForm.telefone} onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} placeholder="(11) 99999-9999" />
                  ) : (
                    <p className="text-sm mt-1 p-2 bg-muted/50 rounded">{profile.telefone || "Não informado"}</p>
                  )}
                </div>
                <div>
                  <Label>Permissão</Label>
                  <p className="text-sm mt-1 p-2 bg-muted/50 rounded">{roleLabels[profile.permissao] || profile.permissao}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Assinatura de E-mail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Faça upload de uma imagem (PNG/JPG) com sua assinatura. Ela será enviada como anexo nos e-mails disparados pelo sistema (ex: SmartSigma) quando você for o autor.
              </p>
              {profile.assinatura_email_url_url ? (
                <div className="border rounded p-3 bg-muted/30 inline-block">
                  <img src={profile.assinatura_email_url_url} alt="Assinatura" className="max-h-32" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nenhuma assinatura enviada.</p>
              )}
              <div className="flex gap-2">
                <input
                  ref={signatureInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={handleSignatureUpload}
                />
                <Button variant="outline" size="sm" onClick={() => signatureInputRef.current?.click()} disabled={uploadingSignature} className="gap-2">
                  {uploadingSignature ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {profile.assinatura_email_url_url ? "Substituir" : "Enviar imagem"}
                </Button>
                {profile.assinatura_email_url_url && (
                  <Button variant="ghost" size="sm" onClick={handleRemoveSignature} className="gap-2 text-destructive">
                    <Trash2 className="h-4 w-4" /> Remover
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Segurança */}
        <TabsContent value="security" className="space-y-6 mt-6">
          {/* Password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Alterar Senha</CardTitle>
            </CardHeader>
            <CardContent>
              {!changingPassword ? (
                <Button variant="outline" onClick={() => setChangingPassword(true)} className="gap-2">
                  <Lock className="h-4 w-4" /> Alterar minha senha
                </Button>
              ) : (
                <div className="space-y-4 max-w-md">
                  {[
                    { key: "current" as const, label: "Senha atual", placeholder: "Digite sua senha atual" },
                    { key: "new" as const, label: "Nova senha", placeholder: "Digite a nova senha" },
                    { key: "confirm" as const, label: "Confirmar nova senha", placeholder: "Confirme a nova senha" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <Label>{label}</Label>
                      <div className="relative">
                        <Input
                          type={showPasswords[key] ? "text" : "password"}
                          value={passwordForm[key]}
                          onChange={(e) => setPasswordForm({ ...passwordForm, [key]: e.target.value })}
                          placeholder={placeholder}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords({ ...showPasswords, [key]: !showPasswords[key] })}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPasswords[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setChangingPassword(false); setPasswordForm({ current: "", new: "", confirm: "" }); }}>
                      Cancelar
                    </Button>
                    <Button onClick={handleChangePassword} disabled={savingPassword}>
                      {savingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Alterar Senha
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2FA */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Autenticação de Dois Fatores (2FA)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Google Authenticator</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.totp_enabled
                      ? "2FA está ativo. Seu login está protegido com código TOTP."
                      : "Proteja sua conta com autenticação de dois fatores."}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={profile.totp_enabled ? "default" : "secondary"}>
                    {profile.totp_enabled ? "Ativo" : "Inativo"}
                  </Badge>
                  {profile.totp_enabled ? (
                    <Button variant="destructive" size="sm" onClick={handleDisable2FA} disabled={disabling2FA}>
                      {disabling2FA ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desativar"}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleSetup2FA} className="gap-2">
                      <Shield className="h-4 w-4" /> Ativar 2FA
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Dispositivos */}
        <TabsContent value="sessions" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" /> Sessões Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma sessão ativa.</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => {
                    const { browser, os, device } = parseUserAgent(session.user_agent);
                    const DeviceIcon = device === "mobile" ? Smartphone : Monitor;
                    return (
                      <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <DeviceIcon className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{browser} — {os}</p>
                              {session.is_current && (
                                <Badge variant="default" className="text-xs">Sessão atual</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {session.ip_address || "Desconhecido"}</span>
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDate(session.last_activity)}</span>
                            </div>
                          </div>
                        </div>
                        {!session.is_current && (
                          <Button variant="ghost" size="sm" onClick={() => handleRevokeSession(session.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 2FA Setup Dialog */}
      <Dialog open={setup2FAOpen} onOpenChange={setSetup2FAOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Configurar 2FA
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code com o Google Authenticator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {qrCodeUrl && (
              <div className="flex justify-center">
                <img src={qrCodeUrl} alt="QR Code 2FA" className="rounded-lg border" />
              </div>
            )}
            {secret2FA && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <code className="text-xs flex-1 break-all font-mono">{secret2FA}</code>
                <Button variant="ghost" size="icon" onClick={copySecret}>
                  {copied2FA ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Digite o código de 6 dígitos:</p>
              <Input
                value={code2FA}
                onChange={(e) => setCode2FA(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                maxLength={6}
              />
            </div>
            <Button onClick={handleVerify2FA} disabled={code2FA.length !== 6 || verifying2FA} className="w-full">
              {verifying2FA ? "Verificando..." : "Ativar 2FA"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MeuPerfil;
