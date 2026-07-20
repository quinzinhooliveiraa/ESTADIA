import React, { useState } from 'react';
import { Smartphone, Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Detection ──────────────────────────────────────────────────────────────

function detectInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Instagram|FBAN|FBAV|FB_IAB|musical_ly|TikTok|BytedanceWebview|Line\//.test(ua);
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function buildIntentUrl(): string {
  const url = window.location.href;
  // Strip the scheme — intent:// needs the bare host+path
  const bare = url.replace(/^https?:\/\//, '');
  return `intent://${bare}#Intent;scheme=https;package=com.android.chrome;end`;
}

// ── Gate screen ────────────────────────────────────────────────────────────

function GateScreen({ onContinueAnyway }: { onContinueAnyway: () => void }) {
  const ios = isIos();
  const appUrl = window.location.href;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(appUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6 text-center">
      <div className="flex flex-col items-center max-w-[320px] gap-6">
        {/* Icon */}
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Smartphone className="w-10 h-10 text-primary" />
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-display uppercase tracking-tight">
            Abre no teu navegador
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Pra instalar o ESTADIA você precisa abrir no Chrome ou Safari.
          </p>
        </div>

        {/* Platform-specific instructions */}
        {ios ? (
          <div className="w-full rounded-xl border border-border bg-muted/40 p-4 text-sm text-left space-y-2">
            <p className="font-semibold text-foreground">No iOS / Safari:</p>
            <p className="text-muted-foreground">
              Toca nos <span className="font-bold">⋯</span> no canto da tela e
              escolhe <span className="font-semibold">"Abrir no navegador"</span>.
            </p>
          </div>
        ) : (
          <a
            href={buildIntentUrl()}
            className="w-full"
          >
            <Button
              size="lg"
              className="w-full h-14 text-base font-bold gap-2"
            >
              <ExternalLink className="w-5 h-5" />
              Abrir no Chrome
            </Button>
          </a>
        )}

        {/* Copy link fallback */}
        <Button
          variant="outline"
          size="lg"
          className="w-full h-12 gap-2"
          onClick={copyLink}
        >
          {copied ? (
            <><Check className="w-4 h-4 text-green-500" /> Link copiado!</>
          ) : (
            <><Copy className="w-4 h-4" /> Copiar link</>
          )}
        </Button>

        {/* Escape hatch */}
        <button
          onClick={onContinueAnyway}
          className="text-xs text-muted-foreground/60 underline underline-offset-2 mt-2"
        >
          continuar mesmo assim
        </button>
      </div>
    </div>
  );
}

// ── Provider component ─────────────────────────────────────────────────────

const IS_IN_APP = detectInAppBrowser();

export function InAppBrowserGate({ children }: { children: React.ReactNode }) {
  const [dismissed, setDismissed] = useState(false);

  if (IS_IN_APP && !dismissed) {
    return <GateScreen onContinueAnyway={() => setDismissed(true)} />;
  }

  return <>{children}</>;
}
