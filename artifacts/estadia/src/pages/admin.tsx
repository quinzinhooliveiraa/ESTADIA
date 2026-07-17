import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('estadia_token') ?? '';
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtBRL(n: number) {
  return `R$ ${fmt(n)}`;
}

function pct(num: number, denom: number) {
  if (!denom) return '—';
  return `${Math.round((num / denom) * 100)}%`;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Metrics {
  cadastros: { total: number; ultimos7dias: number; hoje: number };
  esperas: { total: number; ativas: number; pct_estouradas: number; tempo_medio_min: number };
  cobrancas: { quantidade: number; valor_total: number; valor_pago: number };
  assinaturas: { gratis: number; pro: number; mrr: number; pendentes: number };
  funil: { cadastros: number; fez_espera: number; gerou_cobranca: number; virou_pro: number };
  grafico: { data: string; cadastros: number; esperas: number }[];
}

interface MotoristaRow {
  id: string;
  nome: string | null;
  telefone: string;
  plano: string;
  created_at: string;
  n_esperas: number;
  n_cobrancas: number;
  ultimo_login: string | null;
}

interface MotoristaDetail {
  motorista: {
    id: string; nome: string | null; telefone: string; plano: string;
    tipo: string | null; created_at: string; aceite_termos_ts: string | null;
  };
  veiculos: { id: string; placa: string; tipo: string; capacidade_ton: number }[];
  esperas: {
    id: string; chegada_ts: string; saida_ts: string | null; status: string;
    valor_calculado: number | null; embarcador_nome: string | null;
    cobrancas: { id: string; valor: number; status_pagamento: string }[];
  }[];
  assinaturas: {
    id: string; plano: string; status: string; expira_em: string | null;
    pagamentos: { id: string; valor: number; status: string; pago_em: string | null }[];
  }[];
}

interface Tarifa { id: string; valor_ton_hora: number; vigente_desde: string }
interface PagamentoRow {
  id: string; created_at: string; telefone: string; plano: string;
  valor: number; status: string; pago_em: string | null; charge_id: string;
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <Card className="bg-[#1a1e24] border-[#2a3040]">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold text-[#8A9099] uppercase tracking-wider">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between items-baseline gap-2">
            <span className="text-xs text-[#8A9099]">{r.label}</span>
            <span className="text-sm font-bold text-white tabular-nums">{r.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ativo: 'bg-green-900 text-green-300',
    pago: 'bg-green-900 text-green-300',
    pendente: 'bg-yellow-900 text-yellow-300',
    cancelado: 'bg-red-900 text-red-300',
    expirado: 'bg-gray-800 text-gray-400',
    falhou: 'bg-red-900 text-red-300',
    aguardando: 'bg-blue-900 text-blue-300',
    encerrada: 'bg-gray-800 text-gray-400',
    cobranca_gerada: 'bg-purple-900 text-purple-300',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${map[status] ?? 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  );
}

// ── Dashboard tab ──────────────────────────────────────────────────────────

function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/admin/metrics')
      .then(setMetrics)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 bg-[#1a1e24]" />)}</div>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!metrics) return null;

  const { cadastros, esperas, cobrancas, assinaturas, funil, grafico } = metrics;

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
        <KpiCard title="Cadastros" rows={[
          { label: 'Total', value: String(cadastros.total) },
          { label: 'Últimos 7 dias', value: String(cadastros.ultimos7dias) },
          { label: 'Hoje', value: String(cadastros.hoje) },
        ]} />
        <KpiCard title="Esperas" rows={[
          { label: 'Total', value: String(esperas.total) },
          { label: 'Ativas agora', value: String(esperas.ativas) },
          { label: '% > 5h', value: `${esperas.pct_estouradas}%` },
          { label: 'Tempo médio', value: `${fmt(esperas.tempo_medio_min, 0)} min` },
        ]} />
        <KpiCard title="Cobranças" rows={[
          { label: 'Geradas', value: String(cobrancas.quantidade) },
          { label: 'Valor total', value: fmtBRL(cobrancas.valor_total) },
          { label: 'Recuperado', value: fmtBRL(cobrancas.valor_pago) },
        ]} />
        <KpiCard title="Assinaturas" rows={[
          { label: 'Grátis', value: String(assinaturas.gratis) },
          { label: 'PRO', value: String(assinaturas.pro) },
          { label: 'MRR', value: fmtBRL(assinaturas.mrr) },
          { label: 'Pendentes', value: String(assinaturas.pendentes) },
        ]} />
        <KpiCard title="Funil de conversão" rows={[
          { label: 'Cadastros', value: String(funil.cadastros) },
          { label: '1ª espera', value: `${funil.fez_espera} (${pct(funil.fez_espera, funil.cadastros)})` },
          { label: '1ª cobrança', value: `${funil.gerou_cobranca} (${pct(funil.gerou_cobranca, funil.cadastros)})` },
          { label: 'Virou PRO', value: `${funil.virou_pro} (${pct(funil.virou_pro, funil.cadastros)})` },
        ]} />
      </div>

      {/* Chart */}
      <Card className="bg-[#1a1e24] border-[#2a3040]">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-[#8A9099] uppercase tracking-wider">
            Últimos 30 dias
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={grafico} barCategoryGap="30%">
              <XAxis
                dataKey="data"
                tick={{ fill: '#8A9099', fontSize: 10 }}
                tickFormatter={(v: string) => v.slice(5)}
                interval={4}
              />
              <YAxis tick={{ fill: '#8A9099', fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#111417', border: '1px solid #2a3040', borderRadius: 6 }}
                labelStyle={{ color: '#8A9099', fontSize: 11 }}
                itemStyle={{ color: '#fff', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#8A9099' }} />
              <Bar dataKey="cadastros" fill="#FFC400" name="Cadastros" radius={[2, 2, 0, 0]} />
              <Bar dataKey="esperas" fill="#27C46B" name="Esperas" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Usuários tab ───────────────────────────────────────────────────────────

function Usuarios() {
  const [rows, setRows] = useState<MotoristaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<MotoristaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load(b: string, o: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (b) params.set('busca', b);
      params.set('offset', String(o));
      const data = await apiFetch(`/admin/motoristas?${params}`);
      setRows(data.motoristas);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(busca, offset); }, []);

  function search() { setOffset(0); load(busca, 0); }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await apiFetch(`/admin/motoristas/${id}`);
      setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  }

  if (detail || detailLoading) {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 text-[#8A9099]"
          onClick={() => setDetail(null)}
        >
          ← Voltar
        </Button>
        {detailLoading && <p className="text-[#8A9099] text-sm">Carregando...</p>}
        {detail && <MotoristaDetailView data={detail} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Buscar por telefone ou nome..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          className="bg-[#1a1e24] border-[#2a3040] text-white placeholder:text-[#8A9099] text-sm max-w-xs"
        />
        <Button onClick={search} size="sm" className="bg-[#FFC400] text-black hover:bg-[#e6b000]">
          Buscar
        </Button>
      </div>

      <div className="text-xs text-[#8A9099]">
        {total} motorista{total !== 1 ? 's' : ''}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-[#2a3040] text-[#8A9099]">
              {['Nome', 'Telefone', 'Plano', 'Esperas', 'Cobranças', 'Cadastro', 'Último login'].map((h) => (
                <th key={h} className="pb-2 pr-4 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="py-4 text-[#8A9099]">Carregando...</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[#1a1e24] hover:bg-[#1a1e24] cursor-pointer transition-colors"
                onClick={() => openDetail(r.id)}
              >
                <td className="py-2 pr-4 text-white">{r.nome ?? '—'}</td>
                <td className="py-2 pr-4 font-mono">{r.telefone}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={r.plano} />
                </td>
                <td className="py-2 pr-4 tabular-nums">{r.n_esperas}</td>
                <td className="py-2 pr-4 tabular-nums">{r.n_cobrancas}</td>
                <td className="py-2 pr-4 text-[#8A9099]">
                  {new Date(r.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="py-2 pr-4 text-[#8A9099]">
                  {r.ultimo_login ? new Date(r.ultimo_login).toLocaleDateString('pt-BR') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => { const o = Math.max(0, offset - 20); setOffset(o); load(busca, o); }}
          className="border-[#2a3040] text-[#8A9099] text-xs"
        >
          Anterior
        </Button>
        <span className="text-xs text-[#8A9099] self-center">
          {offset + 1}–{Math.min(offset + 20, total)} de {total}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={offset + 20 >= total}
          onClick={() => { const o = offset + 20; setOffset(o); load(busca, o); }}
          className="border-[#2a3040] text-[#8A9099] text-xs"
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}

function MotoristaDetailView({ data }: { data: MotoristaDetail }) {
  const { motorista, veiculos, esperas, assinaturas } = data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        {[
          ['Nome', motorista.nome ?? '—'],
          ['Telefone', motorista.telefone],
          ['Plano', motorista.plano],
          ['Tipo', motorista.tipo ?? '—'],
          ['Cadastro', new Date(motorista.created_at).toLocaleString('pt-BR')],
          ['Aceite termos', motorista.aceite_termos_ts ? new Date(motorista.aceite_termos_ts).toLocaleDateString('pt-BR') : '—'],
        ].map(([k, v]) => (
          <div key={k} className="bg-[#1a1e24] rounded p-3">
            <div className="text-[#8A9099] mb-1">{k}</div>
            <div className="text-white font-medium">{v}</div>
          </div>
        ))}
      </div>

      {veiculos.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-[#8A9099] uppercase mb-2">Veículos</h3>
          <div className="space-y-1">
            {veiculos.map((v) => (
              <div key={v.id} className="bg-[#1a1e24] rounded px-3 py-2 text-xs flex gap-4">
                <span className="text-white font-mono">{v.placa}</span>
                <span className="text-[#8A9099]">{v.tipo}</span>
                <span className="text-[#8A9099]">{v.capacidade_ton} ton</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold text-[#8A9099] uppercase mb-2">
          Esperas ({esperas.length})
        </h3>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {esperas.length === 0 && <p className="text-[#8A9099] text-xs">Nenhuma espera</p>}
          {esperas.map((e) => (
            <div key={e.id} className="bg-[#1a1e24] rounded px-3 py-2 text-xs">
              <div className="flex gap-3 items-center mb-1">
                <StatusBadge status={e.status} />
                <span className="text-[#8A9099]">
                  {new Date(e.chegada_ts).toLocaleString('pt-BR')}
                </span>
                {e.valor_calculado != null && (
                  <span className="text-white ml-auto">{fmtBRL(e.valor_calculado)}</span>
                )}
              </div>
              {e.embarcador_nome && <div className="text-[#8A9099]">{e.embarcador_nome}</div>}
              {e.cobrancas.map((c) => (
                <div key={c.id} className="ml-2 flex gap-2 items-center mt-0.5">
                  <span className="text-[#FFC400]">cobrança</span>
                  <span className="text-white">{fmtBRL(c.valor)}</span>
                  <StatusBadge status={c.status_pagamento} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {assinaturas.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-[#8A9099] uppercase mb-2">Assinaturas</h3>
          {assinaturas.map((a) => (
            <div key={a.id} className="bg-[#1a1e24] rounded px-3 py-2 text-xs space-y-1">
              <div className="flex gap-3 items-center">
                <span className="text-white font-medium">{a.plano}</span>
                <StatusBadge status={a.status} />
                {a.expira_em && (
                  <span className="text-[#8A9099]">
                    expira {new Date(a.expira_em).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>
              {a.pagamentos.map((p) => (
                <div key={p.id} className="flex gap-3 items-center ml-2">
                  <span className="text-white">{fmtBRL(p.valor)}</span>
                  <StatusBadge status={p.status} />
                  {p.pago_em && (
                    <span className="text-[#8A9099]">{new Date(p.pago_em).toLocaleDateString('pt-BR')}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ── Tarifas tab ────────────────────────────────────────────────────────────

function Tarifas() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [loading, setLoading] = useState(true);
  const [valor, setValor] = useState('');
  const [vigDate, setVigDate] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/tarifas');
      setTarifas(data.tarifas);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await apiFetch('/admin/tarifas', {
        method: 'POST',
        body: JSON.stringify({
          valor_ton_hora: parseFloat(valor.replace(',', '.')),
          vigente_desde: vigDate || undefined,
        }),
      });
      setValor('');
      setVigDate('');
      setConfirm(false);
      setMsg('Tarifa inserida com sucesso.');
      load();
    } catch (e) {
      setMsg('Erro ao salvar tarifa.');
    } finally {
      setSaving(false);
    }
  }

  const parsedValor = parseFloat(valor.replace(',', '.'));
  const valid = !isNaN(parsedValor) && parsedValor > 0;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* History */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-[#2a3040] text-[#8A9099]">
              <th className="pb-2 pr-6 font-medium">Valor (R$/ton/hora)</th>
              <th className="pb-2 font-medium">Vigente desde</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={2} className="py-3 text-[#8A9099]">Carregando...</td></tr>}
            {!loading && tarifas.map((t, i) => (
              <tr key={t.id} className="border-b border-[#1a1e24]">
                <td className="py-2 pr-6 font-mono text-white">
                  {fmtBRL(t.valor_ton_hora)}
                  {i === 0 && (
                    <span className="ml-2 text-[10px] bg-[#FFC400] text-black px-1 rounded">atual</span>
                  )}
                </td>
                <td className="py-2 text-[#8A9099]">
                  {new Date(t.vigente_desde).toLocaleString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New tarifa form */}
      <Card className="bg-[#1a1e24] border-[#2a3040]">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-[#8A9099] uppercase tracking-wider">
            Nova tarifa
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-[#8A9099] mb-1">Valor (R$/ton/hora)</label>
              <Input
                placeholder="ex: 1.90"
                value={valor}
                onChange={(e) => { setValor(e.target.value); setConfirm(false); }}
                className="bg-[#111417] border-[#2a3040] text-white text-sm w-40"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8A9099] mb-1">Vigente desde</label>
              <Input
                type="datetime-local"
                value={vigDate}
                onChange={(e) => { setVigDate(e.target.value); setConfirm(false); }}
                className="bg-[#111417] border-[#2a3040] text-white text-sm w-52"
              />
            </div>
          </div>

          {!confirm ? (
            <Button
              size="sm"
              disabled={!valid}
              onClick={() => setConfirm(true)}
              className="bg-[#FFC400] text-black hover:bg-[#e6b000] text-xs"
            >
              Revisar e confirmar
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-white">
                Novas esperas usarão{' '}
                <strong className="text-[#FFC400]">{fmtBRL(parsedValor)}/ton/hora</strong>.
                Esperas antigas não mudam (snapshot).
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving}
                  className="bg-[#FFC400] text-black hover:bg-[#e6b000] text-xs"
                >
                  {saving ? 'Salvando...' : 'Confirmar inserção'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirm(false)}
                  className="text-[#8A9099] text-xs"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {msg && <p className="text-xs text-[#27C46B]">{msg}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Pagamentos tab ─────────────────────────────────────────────────────────

function Pagamentos() {
  const [rows, setRows] = useState<PagamentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  async function load(st: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (st) params.set('status', st);
      const data = await apiFetch(`/admin/pagamentos?${params}`);
      setRows(data.pagamentos);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(''); }, []);

  const STATUSES = ['', 'pendente', 'pago', 'falhou'];

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); load(s); }}
            className={`text-xs px-3 py-1 rounded transition-colors ${statusFilter === s
              ? 'bg-[#FFC400] text-black font-semibold'
              : 'bg-[#1a1e24] text-[#8A9099] hover:text-white'}`}
          >
            {s || 'Todos'}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-[#2a3040] text-[#8A9099]">
              {['Data', 'Telefone', 'Plano', 'Valor', 'Status', 'Pago em', 'Charge ID'].map((h) => (
                <th key={h} className="pb-2 pr-4 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="py-4 text-[#8A9099]">Carregando...</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-b border-[#1a1e24]">
                <td className="py-2 pr-4 text-[#8A9099]">
                  {new Date(r.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="py-2 pr-4 font-mono">{r.telefone}</td>
                <td className="py-2 pr-4">{r.plano}</td>
                <td className="py-2 pr-4 tabular-nums text-white">{fmtBRL(r.valor)}</td>
                <td className="py-2 pr-4"><StatusBadge status={r.status} /></td>
                <td className="py-2 pr-4 text-[#8A9099]">
                  {r.pago_em ? new Date(r.pago_em).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="py-2 pr-4 font-mono text-[#8A9099] text-[10px] truncate max-w-[140px]">
                  {r.charge_id}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="py-4 text-[#8A9099]">Nenhum pagamento encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Admin page ────────────────────────────────────────────────────────

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('estadia_token');
    if (!token) { setLocation('/'); return; }

    // Try to reach a protected admin endpoint; 404 = not admin
    apiFetch('/admin/tarifas')
      .then(() => { setAllowed(true); setChecking(false); })
      .catch(() => { setLocation('/'); });
  }, [setLocation]);

  if (checking) return null;
  if (!allowed) return null;

  return (
    <div className="min-h-screen bg-[#111417] text-white">
      {/* Header */}
      <header className="border-b border-[#2a3040] px-6 py-3 flex items-center gap-3">
        <span className="text-[#FFC400] font-black text-lg tracking-widest">ESTADIA</span>
        <span className="text-[#2a3040]">/</span>
        <span className="text-[#8A9099] text-sm font-medium">Painel Admin</span>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs defaultValue="dashboard">
          <TabsList className="bg-[#1a1e24] border border-[#2a3040] mb-6">
            {(['dashboard', 'usuarios', 'tarifas', 'pagamentos'] as const).map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className="text-xs capitalize data-[state=active]:bg-[#FFC400] data-[state=active]:text-black"
              >
                {t === 'usuarios' ? 'Usuários' : t.charAt(0).toUpperCase() + t.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard"><Dashboard /></TabsContent>
          <TabsContent value="usuarios"><Usuarios /></TabsContent>
          <TabsContent value="tarifas"><Tarifas /></TabsContent>
          <TabsContent value="pagamentos"><Pagamentos /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
