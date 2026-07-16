import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Truck, MapPin, CheckCircle2, ChevronRight } from 'lucide-react';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';

export default function Onboarding() {
  const [slide, setSlide] = useState(0);
  const [, setLocation] = useLocation();

  const handleFinish = () => {
    localStorage.setItem('estadia_onboarding_seen', 'true');
    setLocation('/login');
  };

  const slides = [
    {
      icon: <Truck className="w-16 h-16 text-primary mb-6" />,
      title: "Ficou parado mais de 5 horas?",
      subtitle: "Eles te devem.",
      description: "A lei 13.103 é clara. Tempo de espera é tempo de trabalho. Não deixe seu dinheiro na mesa.",
    },
    {
      icon: <MapPin className="w-16 h-16 text-primary mb-6" />,
      title: "O app é sua testemunha",
      subtitle: "GPS + registro imutável",
      description: "Chegou no cliente? Aperte um botão. O app registra a hora e o local exato com GPS. Não tem como eles negarem.",
    },
    {
      icon: <CheckCircle2 className="w-16 h-16 text-primary mb-6" />,
      title: "Cobrança pronta no WhatsApp",
      subtitle: "Fácil e rápido",
      description: "Geramos um PDF oficial com a cobrança baseada na tabela ANTT. É só mandar pro embarcador.",
    }
  ];

  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] p-6 relative">
        <button 
          onClick={handleFinish}
          className="absolute top-6 right-6 text-muted-foreground font-medium text-sm"
        >
          Pular
        </button>

        <div className="flex-1 flex flex-col justify-center">
          <div className="flex justify-center mb-8">
            <div className="flex gap-2">
              {slides.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-8 bg-primary' : 'w-2 bg-muted'}`}
                />
              ))}
            </div>
          </div>

          <div className="text-center animate-in fade-in zoom-in duration-300 flex flex-col items-center">
            {slides[slide].icon}
            <h1 className="text-3xl font-display uppercase tracking-tight mb-2">
              {slides[slide].title}
            </h1>
            <h2 className="text-xl font-semibold text-muted-foreground mb-4">
              {slides[slide].subtitle}
            </h2>
            <p className="text-foreground/80 leading-relaxed max-w-[280px]">
              {slides[slide].description}
            </p>
          </div>
        </div>

        <div className="pb-8">
          {slide < slides.length - 1 ? (
            <Button 
              size="lg" 
              className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setSlide(s => s + 1)}
            >
              Próximo
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          ) : (
            <Button 
              size="lg" 
              className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleFinish}
            >
              Começar agora
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
