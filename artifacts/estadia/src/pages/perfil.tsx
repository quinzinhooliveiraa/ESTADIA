import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  useGetPerfil, 
  useGetAssinatura, 
  useListVeiculos,
  useCreateVeiculo,
  useDeleteVeiculo,
  useCancelarAssinatura,
  useExportDados,
  useDeletePerfil,
  useLogout,
  getGetPerfilQueryKey,
  getListVeiculosQueryKey,
  getGetAssinaturaQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { User, Truck, LogOut, Trash2, Download, AlertTriangle, Loader2 } from 'lucide-react';
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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Perfil() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: perfil } = useGetPerfil({ query: { queryKey: getGetPerfilQueryKey() } });
  const { data: assinatura } = useGetAssinatura({ query: { queryKey: getGetAssinaturaQueryKey() } });
  const { data: veiculos } = useListVeiculos({ query: { queryKey: getListVeiculosQueryKey() } });
  
  const createVeiculo = useCreateVeiculo();
  const deleteVeiculo = useDeleteVeiculo();
  const cancelarAssinatura = useCancelarAssinatura();
  const exportDados = useExportDados();
  const deletePerfil = useDeletePerfil();
  const logout = useLogout();

  const [novaPlaca, setNovaPlaca] = useState('');
  const [novaCapacidade, setNovaCapacidade] = useState('');

  const isPro = perfil?.plano === 'pro_mensal' || perfil?.plano === 'pro_anual';

  const handleAddVeiculo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaPlaca || !novaCapacidade) return;
    
    createVeiculo.mutate({
      data: {
        placa: novaPlaca.toUpperCase(),
        capacidade_ton: Number(novaCapacidade),
        tipo: 'Truck' // Defaulting for simple UI
      }
    }, {
      onSuccess: () => {
        setNovaPlaca('');
        setNovaCapacidade('');
        toast({ title: 'Veículo adicionado' });
        queryClient.invalidateQueries({ queryKey: getListVeiculosQueryKey() });
      }
    });
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem('estadia_token');
        setLocation('/login');
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background p-4 pb-24 overflow-y-auto">
        <h1 className="text-2xl font-display text-primary mb-6">PERFIL</h1>

        <div className="bg-card border border-card-border rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{perfil?.telefone}</h2>
              <div className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold mt-1 ${isPro ? 'bg-pro/20 text-pro' : 'bg-secondary text-muted-foreground'}`}>
                {isPro ? 'PRO ATIVO' : 'PLANO GRÁTIS'}
              </div>
            </div>
          </div>

          {assinatura && assinatura.status === 'ativo' && (
            <div className="border-t border-border pt-4 mt-2">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-muted-foreground">Próxima cobrança</span>
                <span className="text-sm font-bold">
                  {assinatura.expira_em ? format(new Date(assinatura.expira_em), "dd/MM/yyyy", { locale: ptBR }) : '-'}
                </span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  cancelarAssinatura.mutate(undefined, {
                    onSuccess: () => {
                      toast({ title: 'Assinatura cancelada' });
                      queryClient.invalidateQueries({ queryKey: getGetAssinaturaQueryKey() });
                    }
                  });
                }}
                disabled={cancelarAssinatura.isPending}
              >
                Cancelar assinatura
              </Button>
            </div>
          )}
          {!isPro && (
            <Button className="w-full mt-2 bg-pro hover:bg-pro/90 text-white font-bold" onClick={() => setLocation('/paywall')}>
              Fazer Upgrade para PRO
            </Button>
          )}
        </div>

        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Meus Veículos</h3>
        
        <div className="flex flex-col gap-3 mb-6">
          {veiculos?.map(v => (
            <div key={v.id} className="bg-card border border-border rounded-xl p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Truck className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-bold text-sm">{v.placa}</p>
                  <p className="text-xs text-muted-foreground">{v.capacidade_ton} toneladas</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  deleteVeiculo.mutate({ id: v.id }, {
                    onSuccess: () => queryClient.invalidateQueries({ queryKey: getListVeiculosQueryKey() })
                  });
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <form onSubmit={handleAddVeiculo} className="bg-secondary/50 border border-border border-dashed rounded-xl p-4 mt-2">
            <h4 className="text-xs font-bold mb-3 uppercase tracking-wider">Adicionar Veículo</h4>
            <div className="flex gap-2 mb-3">
              <Input 
                placeholder="PLACA" 
                className="flex-1 uppercase font-mono bg-card" 
                value={novaPlaca}
                onChange={e => setNovaPlaca(e.target.value.toUpperCase().slice(0, 7))}
                maxLength={7}
              />
              <Input 
                type="number"
                placeholder="TON" 
                className="w-24 bg-card" 
                value={novaCapacidade}
                onChange={e => setNovaCapacidade(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" className="w-full font-bold bg-primary text-primary-foreground hover:bg-primary/90" disabled={createVeiculo.isPending}>
              {createVeiculo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Veículo'}
            </Button>
          </form>
        </div>

        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1 mt-4">Privacidade (LGPD)</h3>

        {/* C3: links to legal pages */}
        <div className="flex gap-3 mb-3 px-1">
          <button onClick={() => setLocation('/termos')} className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
            Termos de Uso
          </button>
          <span className="text-xs text-muted-foreground/40">·</span>
          <button onClick={() => setLocation('/privacidade')} className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
            Política de Privacidade
          </button>
        </div>

        <div className="bg-card border border-border rounded-xl p-2 mb-8">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-foreground mb-1"
            onClick={() => exportDados.refetch().then(() => toast({ title: 'Exportação solicitada', description: 'Seus dados foram exportados.' }))}
          >
            <Download className="w-4 h-4 mr-3 text-muted-foreground" />
            Exportar meus dados
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10">
                <AlertTriangle className="w-4 h-4 mr-3" />
                Excluir minha conta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-[360px] rounded-2xl bg-card border-card-border">
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar sua assinatura?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  Essa ação não pode ser desfeita. Todos os seus dados, históricos de espera e cobranças serão apagados para sempre.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col gap-2 mt-4 sm:flex-col">
                <AlertDialogCancel className="mt-0 border-border bg-transparent text-foreground hover:bg-secondary">Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
                  onClick={() => {
                    deletePerfil.mutate(undefined, {
                      onSuccess: () => {
                        localStorage.removeItem('estadia_token');
                        setLocation('/login');
                      }
                    });
                  }}
                >
                  Sim, excluir conta
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {perfil?.is_admin && (
          <Button
            variant="outline"
            size="lg"
            className="w-full border-primary/40 text-primary font-bold hover:bg-primary/10 hover:text-primary mb-3"
            onClick={() => setLocation('/admin')}
          >
            📊 Painel Admin
          </Button>
        )}

        <Button 
          variant="outline" 
          size="lg" 
          className="w-full border-border font-bold text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5 mr-2" />
          Sair do Aplicativo
        </Button>
      </div>
    </AppLayout>
  );
}
