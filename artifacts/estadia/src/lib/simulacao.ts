const SIMULACAO_SEEN_PREFIX = 'estadia_simulacao_seen_';

export function simulacaoSeenKey(motoristaId: string): string {
  return `${SIMULACAO_SEEN_PREFIX}${motoristaId}`;
}

export function hasSeenSimulacao(motoristaId: string): boolean {
  return localStorage.getItem(simulacaoSeenKey(motoristaId)) === 'true';
}

export function markSimulacaoSeen(motoristaId: string): void {
  localStorage.setItem(simulacaoSeenKey(motoristaId), 'true');
}