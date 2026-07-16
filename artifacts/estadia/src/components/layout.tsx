import React from 'react';
import { Link, useLocation } from 'wouter';
import { Home, ClipboardList, User } from 'lucide-react';

export function BottomNav() {
  const [location] = useLocation();

  const navItems = [
    { href: '/', icon: Home, label: 'Início' },
    { href: '/historico', icon: ClipboardList, label: 'Histórico' },
    { href: '/perfil', icon: User, label: 'Perfil' },
  ];

  return (
    <nav className="fixed bottom-0 w-full max-w-md mx-auto bg-card border-t border-border z-50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppLayout({ children, showNav = true }: { children: React.ReactNode; showNav?: boolean }) {
  return (
    <div className="min-h-[100dvh] w-full bg-background flex justify-center font-sans">
      <div className={`w-full max-w-md bg-background relative flex flex-col ${showNav ? 'pb-16' : ''}`}>
        {children}
        {showNav && <BottomNav />}
      </div>
    </div>
  );
}
