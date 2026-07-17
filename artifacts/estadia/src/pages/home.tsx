import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useGetPerfil,
  useGetUsoMes,
  useListVeiculos,
  useCreateVeiculo,
  useCreateEspera,
  useGetEsperasResumo,
} from '@workspace/api-client-react';
import { Truck, MapPin, Loader2 } from 'lucide-react';

const CAPACITY_CHIPS = [
  { label: 'VUC',        tons: 4  },
  { label: 'Toco',       tons: 6  },
  { label: 'Truck',      tons: 12 },
  { label: 'Bitruck',    tons: 20 },
  { label: 'Carreta',    tons: 27 },
  { label: 'Vanderleia', tons: 32 },
  { label: 'Bitrem',     tons: 40 },
  { label: 'Rodotrem',   tons: 50 },
] as const;

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: perfil } = useGetPerfil();
  const { data: uso } = useGetUsoMes();
  const { data: veiculos, isLoading: veiculosLoading } = useListVeiculos();
  const { data: resumo } = useGetEsperasResumo();

  const createEspera = useCreateEspera();
  const createVeiculo = useCreateVeiculo();

  // Selected from existing vehicles list
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  // Provisional chip selection (no registered vehicle)
  const [provisionalChip, setProvisionalChip] = useState<{ label: string; tons: number } | null>(null);
  const [customTons, setCustomTons] = useState('');
  const [loadingGps, setLoadingGps] = useState(false);

  const hasVehicles = !veiculosLoading && veiculos && veiculos.length > 0;

  useEffect(() => {
    if (veiculos && veiculos.length > 0 && !selectedVehicleId) {
      const padrao = veiculos.find(v => v.is_padrao);
      setSelectedVehicleId(padrao?.id || veiculos[0].id);
    }
  }, [veiculos, selectedVehicleId]);

  const resolvedTons = provisionalChip?.tons ?? (customTons ? parseFloat(customTons) : null);
  const canCheguei = hasVehicles
    ? !!selectedVehicleId
    : resolvedTons != null && resolvedTons > 0;

  const doCreateEspera = (veiculoId: string) => {
    setLoadingGps(true);
    if (!navigator.geolocation) {
      setLoadingGps(false);
      toast({ title: 'Erro de GPS', description: 'Seu navegador não suporta geolocalização.', variant: 'destructive' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        createEspera.mutate({
          data: {
            veiculo_id: veiculoId,
            chegada_device_ts: new Date().toISOString(),
            chegada_lat: latitude,
            chegada_lng: longitude,
            chegada_precisao_m: accuracy,
          }
        }, {
          onSuccess: (data) => {
            setLoadingGps(false);
            setLocation(`/espera/${data.id}`);
          },
          onError: (err: any) => {
            setLoadingGps(false);
            if (err?.status === 402) {
              sessionStorage.setItem('paywall_valor', err?.data?.valor_em_jogo?.toString() || '0');
              setLocation('/paywall');
            } else {
              toast({ title: 'Erro ao registrar chegada', description: 'Tente novamente.', variant: 'destructive' });
            }
          }
        });
      },
      () => {
        setLoadingGps(false);
        toast({ title: 'Erro de GPS', description: 'Ative a localização para registrar a estadia.', variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleCheguei = () => {
    if (hasVehicles) {
      if (!selectedVehicleId) {
        toast({ title: 'Selecione um veículo', variant: 'destructive' });
        return;
      }
      doCreateEspera(selectedVehicleId);
      return;
    }

    // Provisional: create vehicle silently then start espera
    const tons = resolvedTons;
    if (!tons || tons <= 0) {
      toast({ title: 'Selecione a capacidade do veículo', variant: 'destructive' });
      return;
    }

    setLoadingGps(true);
    createVeiculo.mutate({
      data: {
        capacidade_ton: tons,
        tipo: provisionalChip?.label ?? 'Outro',
        placa: '',
      }
    }, {
      onSuccess: (veiculo) => {
        doCreateEspera(veiculo.id);
      },
      onError: () => {
        setLoadingGps(false);
        toast({ title: 'Erro ao registrar veículo', variant: 'destructive' });
      }
    });
  };

  const isPro = perfil?.plano === 'pro_mensal' || perfil?.plano === 'pro_anual';
  const hasEsperaAtiva = resumo?.espera_ativa;
  const isBusy = loadingGps || createEspera.isPending || createVeiculo.isPending;

  return (
    <AppLayout>
      <div className="flex flex-col h-full p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-display text-primary">ESTADIA</h1>
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${isPro ? 'bg-pro/20 text-pro' : 'bg-secondary text-muted-foreground'}`}>
            {isPro ? (
              <span className="flex items-center gap-1">⚡ PRO ATIVO</span>
            ) : (
              <span>
                PLANO GRÁTIS:{' '}
                {uso ? (uso.limite === null ? 'ILIMITADO' : `${Math.max(0, uso.limite - uso.cobrancas_geradas)} DISPONÍVEL`) : '-'}
              </span>
            )}
          </div>
        </div>

        {hasEsperaAtiva && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Truck className="text-primary w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Espera em andamento</h3>
                <p className="text-xs text-muted-foreground">
                  Desde {new Date(hasEsperaAtiva.chegada_ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => setLocation(`/espera/${hasEsperaAtiva.id}`)}>
              Ver tempo
            </Button>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">

          {/* ── Vehicle selection ─────────────────────────────────── */}
          {hasVehicles ? (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-4">Com qual veículo você está?</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {veiculos!.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVehicleId(v.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                      selectedVehicleId === v.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    <Truck className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold">{v.placa || v.tipo}</span>
                    <span className="text-[10px] opacity-80">{v.capacidade_ton}t</span>
                  </button>
                ))}
              </div>
            </div>
          ) : !veiculosLoading ? (
            /* ── Quick capacity chips (first-time user) ───────────── */
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-1">Qual a capacidade do seu veículo?</h2>
              <p className="text-xs text-muted-foreground mb-4">Você pode completar o cadastro depois.</p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {CAPACITY_CHIPS.map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => { setProvisionalChip(chip); setCustomTons(''); }}
                    className={`flex flex-col items-center justify-center py-3 px-1 rounded-xl border transition-all ${
                      provisionalChip?.label === chip.label
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    <span className="text-[11px] font-bold leading-tight">{chip.label}</span>
                    <span className="text-[10px] opacity-70">{chip.tons}t</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Outra:</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="__ ton"
                  value={customTons}
                  onChange={e => { setCustomTons(e.target.value); setProvisionalChip(null); }}
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          ) : null}

          {/* ── CHEGUEI button ───────────────────────────────────── */}
          <Button
            size="lg"
            className="w-full h-24 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_40px_-10px_rgba(255,196,0,0.4)] transition-all active:scale-95 flex flex-col items-center justify-center relative overflow-hidden"
            onClick={handleCheguei}
            disabled={isBusy || !canCheguei || !!hasEsperaAtiva}
          >
            {isBusy ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin mb-1" />
                <span className="text-sm font-bold opacity-80">BUSCANDO GPS...</span>
              </div>
            ) : (
              <>
                <span className="font-display text-4xl tracking-tight leading-none mb-1">CHEGUEI</span>
                <span className="text-xs font-bold opacity-75 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> REGISTRAR CHEGADA COM GPS
                </span>
              </>
            )}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
