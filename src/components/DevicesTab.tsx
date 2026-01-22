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
      <CardHeader className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Monitor className="h-4 w-4 md:h-5 md:w-5" />
              Dispositivos Conectados
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Gerencie os dispositivos que têm acesso à sua conta
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchDevices} className="flex-1 sm:flex-none">
              <RefreshCw className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            {devices.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isRevokingAll} className="flex-1 sm:flex-none">
                    {isRevokingAll ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4 mr-1" />
                    )}
                    <span className="hidden sm:inline">Desconectar Todos</span>
                    <span className="sm:hidden">Todos</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="mx-4 max-w-[calc(100%-2rem)] sm:max-w-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar todos os dispositivos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso irá encerrar todas as sessões em todos os dispositivos, incluindo este. Você precisará fazer login novamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                    <AlertDialogCancel className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevokeAll} className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Desconectar Todos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
        {devices.length === 0 ? (
          <div className="text-center py-6 md:py-8 text-muted-foreground">
            <Monitor className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 md:mb-4 opacity-50" />
            <p className="text-sm md:text-base">Nenhum dispositivo conectado encontrado.</p>
            <p className="text-xs md:text-sm">Os dispositivos aparecerão aqui após você fazer login com 2FA.</p>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4">
            {devices.map((device) => {
              const DeviceIcon = getDeviceIcon(device.device_type);
              const current = isCurrentDevice(device);
              const trusted = isTrusted(device);

              return (
                <div
                  key={device.dispositivo_id}
                  className={`flex items-start gap-3 md:gap-4 p-3 md:p-4 border rounded-lg ${current ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className={`p-1.5 md:p-2 rounded-full flex-shrink-0 ${current ? "bg-primary/10" : "bg-muted"}`}>
                    <DeviceIcon className={`h-5 w-5 md:h-6 md:w-6 ${current ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                      <span className="font-medium text-sm md:text-base">
                        {getDeviceTypeName(device.device_type)}
                      </span>
                      {device.browser_name && (
                        <span className="text-muted-foreground text-xs md:text-sm">• {device.browser_name}</span>
                      )}
                      {device.os_name && (
                        <span className="text-muted-foreground text-xs md:text-sm hidden sm:inline">• {device.os_name}</span>
                      )}
                      {current && (
                        <Badge variant="default" className="text-[10px] md:text-xs">
                          Este dispositivo
                        </Badge>
                      )}
                      {trusted && (
                        <Badge variant="outline" className="text-[10px] md:text-xs border-green-500 text-green-600">
                          <Shield className="h-2.5 w-2.5 md:h-3 md:w-3 mr-0.5 md:mr-1" />
                          Confiável
                        </Badge>
                      )}
                    </div>
                    
                    <div className="mt-1.5 md:mt-2 space-y-0.5 md:space-y-1 text-xs md:text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{formatLocation(device)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <Globe className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">IP: {device.ip_address || "Desconhecido"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                          Último acesso: {formatDistanceToNow(new Date(device.last_activity), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                      <div className="text-[10px] md:text-xs opacity-75">
                        Primeiro login: {format(new Date(device.login_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                      {trusted && device.remember_until && (
                        <div className="text-[10px] md:text-xs text-green-600">
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
