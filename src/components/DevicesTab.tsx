import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Smartphone, 
  Monitor, 
  Tablet, 
  MapPin, 
  Clock, 
  Shield, 
  LogOut, 
  Loader2,
  RefreshCw,
  Globe
} from "lucide-react";
import { getUserDevices, revokeDevice, Device, getDeviceToken } from "@/services/authService";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const getDeviceIcon = (deviceType: string) => {
  switch (deviceType) {
    case "mobile":
      return Smartphone;
    case "tablet":
      return Tablet;
    default:
      return Monitor;
  }
};

const getDeviceTypeName = (deviceType: string) => {
  switch (deviceType) {
    case "mobile":
      return "Smartphone";
    case "tablet":
      return "Tablet";
    default:
      return "Desktop";
  }
};

export function DevicesTab() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState<number | null>(null);
  const [isRevokingAll, setIsRevokingAll] = useState(false);
  const { user } = useUser();
  const { toast } = useToast();
  const currentDeviceToken = getDeviceToken();

  const fetchDevices = async () => {
    setIsLoading(true);
    const result = await getUserDevices(user.id);
    if (result.success) {
      setDevices(result.devices);
    } else {
      toast({
        title: "Erro",
        description: result.error || "Erro ao carregar dispositivos",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (user.id) {
      fetchDevices();
    }
  }, [user.id]);

  const handleRevokeDevice = async (deviceId: number) => {
    setIsRevoking(deviceId);
    const result = await revokeDevice(user.id, deviceId);
    setIsRevoking(null);

    if (result.success) {
      toast({
        title: "Dispositivo desconectado",
        description: result.message,
      });
      fetchDevices();
    } else {
      toast({
        title: "Erro",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleRevokeAll = async () => {
    setIsRevokingAll(true);
    const result = await revokeDevice(user.id, undefined, true);
    setIsRevokingAll(false);

    if (result.success) {
      toast({
        title: "Dispositivos desconectados",
        description: result.message,
      });
      fetchDevices();
    } else {
      toast({
        title: "Erro",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const formatLocation = (device: Device) => {
    const parts = [];
    if (device.location_city) parts.push(device.location_city);
    if (device.location_state) parts.push(device.location_state);
    if (device.location_country && device.location_country !== "Local") parts.push(device.location_country);
    return parts.length > 0 ? parts.join(", ") : "Localização desconhecida";
  };

  const isCurrentDevice = (device: Device) => device.device_token === currentDeviceToken;

  const isTrusted = (device: Device) => {
    if (!device.remember_until) return false;
    return new Date(device.remember_until) > new Date();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Dispositivos Conectados
          </CardTitle>
          <CardDescription>Carregando dispositivos...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-start gap-4 p-4 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Dispositivos Conectados
            </CardTitle>
            <CardDescription>
              Gerencie os dispositivos que têm acesso à sua conta
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchDevices}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
            {devices.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isRevokingAll}>
                    {isRevokingAll ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4 mr-1" />
                    )}
                    Desconectar Todos
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar todos os dispositivos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso irá encerrar todas as sessões em todos os dispositivos, incluindo este. Você precisará fazer login novamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevokeAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Desconectar Todos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {devices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum dispositivo conectado encontrado.</p>
            <p className="text-sm">Os dispositivos aparecerão aqui após você fazer login com 2FA.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {devices.map((device) => {
              const DeviceIcon = getDeviceIcon(device.device_type);
              const current = isCurrentDevice(device);
              const trusted = isTrusted(device);

              return (
                <div
                  key={device.dispositivo_id}
                  className={`flex items-start gap-4 p-4 border rounded-lg ${current ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className={`p-2 rounded-full ${current ? "bg-primary/10" : "bg-muted"}`}>
                    <DeviceIcon className={`h-6 w-6 ${current ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {getDeviceTypeName(device.device_type)}
                      </span>
                      {device.browser_name && (
                        <span className="text-muted-foreground">• {device.browser_name}</span>
                      )}
                      {device.os_name && (
                        <span className="text-muted-foreground">• {device.os_name}</span>
                      )}
                      {current && (
                        <Badge variant="default" className="text-xs">
                          Este dispositivo
                        </Badge>
                      )}
                      {trusted && (
                        <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                          <Shield className="h-3 w-3 mr-1" />
                          Confiável
                        </Badge>
                      )}
                    </div>
                    
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3" />
                        <span>{formatLocation(device)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-3 w-3" />
                        <span>IP: {device.ip_address || "Desconhecido"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        <span>
                          Último acesso: {formatDistanceToNow(new Date(device.last_activity), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                      <div className="text-xs opacity-75">
                        Primeiro login: {format(new Date(device.login_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                      {trusted && device.remember_until && (
                        <div className="text-xs text-green-600">
                          Confiável até: {format(new Date(device.remember_until), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                      )}
                    </div>
                  </div>

                  {!current && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          disabled={isRevoking === device.dispositivo_id}
                          className="text-destructive hover:text-destructive"
                        >
                          {isRevoking === device.dispositivo_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LogOut className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Desconectar dispositivo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso irá encerrar a sessão neste dispositivo. O usuário precisará fazer login novamente e passar pelo 2FA.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleRevokeDevice(device.dispositivo_id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Desconectar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
