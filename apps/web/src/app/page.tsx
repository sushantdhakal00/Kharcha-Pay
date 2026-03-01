"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

function AnimatedCounter({ end, duration = 2000, suffix = "" }: { end: number; duration?: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const startTime = Date.now();
          const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            setCount(Math.floor(end * eased));
            if (progress < 1) requestAnimationFrame(animate);
          };
          animate();
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return (
    <span ref={ref} className="counter">
      {count.toLocaleString()}{suffix}
    </span>
  );
}

function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="orb w-[500px] h-[500px] bg-red-700/15 top-[-10%] left-[5%]" />
      <div className="orb w-[400px] h-[400px] bg-amber-600/12 top-[20%] right-[-5%]" style={{ animationDelay: "-5s" }} />
      <div className="orb w-[450px] h-[450px] bg-orange-500/8 bottom-[20%] left-[-10%]" style={{ animationDelay: "-10s" }} />
      {/* Warmer indigo/violet instead of pure blue */}
      <div className="orb w-[350px] h-[350px] bg-violet-800/10 top-[55%] right-[20%]" style={{ animationDelay: "-15s" }} />
      <div className="orb w-[280px] h-[280px] bg-indigo-700/8 bottom-[10%] right-[40%]" style={{ animationDelay: "-8s" }} />
    </div>
  );
}

function PrayerFlagStrip() {
  const colors = [
    "bg-indigo-500",
    "bg-stone-100", 
    "bg-red-500",
    "bg-emerald-600",
    "bg-amber-400"
  ];
  return (
    <div className="flex h-1.5 w-full overflow-hidden">
      {[...Array(25)].map((_, i) => (
        <div 
          key={i} 
          className={`flex-1 ${colors[i % 5]}`} 
          style={{ opacity: 0.7 + (Math.sin(i * 0.5) * 0.2) }}
        />
      ))}
    </div>
  );
}

function TimelineStep({ 
  number, 
  title, 
  description, 
  isLast = false,
  delay = 0
}: { 
  number: number; 
  title: string; 
  description: string;
  isLast?: boolean;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setIsVisible(true);
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative flex gap-6">
      {!isLast && (
        <div 
          className="absolute left-6 top-14 w-[2px] h-[calc(100%-20px)] bg-gradient-to-b from-red-600 to-transparent"
          style={{
            opacity: isVisible ? 1 : 0,
            transition: "opacity 1s ease",
            transitionDelay: `${delay + 300}ms`
          }}
        />
      )}
      <div
        className={`relative z-10 w-12 h-12 rounded-full bg-gradient-to-br from-red-600 to-amber-500 flex items-center justify-center text-white font-bold text-lg shrink-0 transition-all duration-700 ${
          isVisible ? "opacity-100 scale-100" : "opacity-0 scale-50"
        }`}
        style={{ transitionDelay: `${delay}ms` }}
      >
        {number}
      </div>
      <div
        className={`pb-12 transition-all duration-700 ${
          isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10"
        }`}
        style={{ transitionDelay: `${delay + 150}ms` }}
      >
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function BentoCard({ 
  children, 
  className = "", 
  delay = 0 
}: { 
  children: React.ReactNode; 
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`glass-card glass-card-hover rounded-3xl p-8 shimmer transition-all duration-700 ${className} ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    const handleMouse = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", handleMouse, { passive: true });
    
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouse);
    };
  }, []);

  return (
    <main className="min-h-screen gradient-mesh landing-scroll noise-overlay relative overflow-x-hidden">
      <FloatingOrbs />
      <div className="grid-pattern absolute inset-0 pointer-events-none" />
      
      {/* Cursor glow effect - warm */}
      <div 
        className="fixed w-[400px] h-[400px] pointer-events-none z-0 transition-all duration-300 ease-out"
        style={{
          background: "radial-gradient(circle, rgba(220, 20, 60, 0.06) 0%, rgba(255, 153, 51, 0.03) 40%, transparent 70%)",
          left: mousePos.x - 200,
          top: mousePos.y - 200,
        }}
      />

      {/* Prayer flag strip at very top */}
      <div className="fixed top-0 left-0 right-0 z-[60]">
        <PrayerFlagStrip />
      </div>

      {/* Navigation */}
      <nav className="fixed top-1 left-0 right-0 z-50 transition-all duration-300" style={{
        background: scrollY > 50 ? "rgba(24, 24, 27, 0.92)" : "transparent",
        backdropFilter: scrollY > 50 ? "blur(20px)" : "none",
        borderBottom: scrollY > 50 ? "1px solid rgba(120, 113, 108, 0.15)" : "none"
      }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 via-red-500 to-amber-500 flex items-center justify-center transform group-hover:scale-110 transition-transform shadow-lg shadow-red-600/20">
              <span className="text-white font-bold text-lg">ख</span>
            </div>
            <span className="font-bold text-white text-xl tracking-tight">KharchaPay</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="#how-it-works" className="text-sm text-slate-400 hover:text-white transition-colors relative group">
              How it works
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-gradient-to-r from-red-600 to-amber-500 group-hover:w-full transition-all" />
            </Link>
            <Link href="#features" className="text-sm text-slate-400 hover:text-white transition-colors relative group">
              Features
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-gradient-to-r from-red-600 to-amber-500 group-hover:w-full transition-all" />
            </Link>
            <Link href="/pricing" className="text-sm text-slate-400 hover:text-white transition-colors relative group">
              Pricing
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-gradient-to-r from-red-600 to-amber-500 group-hover:w-full transition-all" />
            </Link>
            <Link href="/whitepaper" className="text-sm text-slate-400 hover:text-white transition-colors relative group">
              Whitepaper
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-gradient-to-r from-red-600 to-amber-500 group-hover:w-full transition-all" />
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-slate-300 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link
              href="/register?redirect=/onboarding/create-org"
              className="relative overflow-hidden rounded-full bg-gradient-to-r from-red-600 to-amber-500 px-5 py-2.5 text-sm font-medium text-white transition-all hover:shadow-[0_0_30px_rgba(220,20,60,0.4)] hover:scale-105"
            >
              <span className="relative z-10">Get Started</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 spotlight">
        {/* Mountain background image */}
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1920&q=80"
            alt="Himalayan Mountains"
            fill
            className="object-cover opacity-15"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#18181B] via-[#18181B]/85 to-[#18181B]" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-6 py-20 text-center">
          <div 
            className="animate-float mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300 backdrop-blur-sm"
            style={{ animation: "slideUp 0.8s ease forwards" }}
          >
            <span className="flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            Powered by Solana Token-2022
          </div>

          <h1 
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6"
            style={{ animation: "slideUp 0.8s ease forwards 0.1s", animationFillMode: "both" }}
          >
            <span className="text-white">Enterprise Finance</span>
            <br />
            <span className="gradient-text">Made Simple</span>
          </h1>

          <p 
            className="mx-auto max-w-2xl text-lg sm:text-xl text-slate-400 mb-10 leading-relaxed"
            style={{ animation: "slideUp 0.8s ease forwards 0.2s", animationFillMode: "both" }}
          >
            From the land of Everest, a treasury platform built for the modern enterprise. 
            Track expenses, approve budgets, and execute verifiable payments on Solana.
          </p>

          <div 
            className="flex flex-wrap justify-center gap-4 mb-16"
            style={{ animation: "slideUp 0.8s ease forwards 0.3s", animationFillMode: "both" }}
          >
            <Link
              href="/register?redirect=/onboarding/create-org"
              className="group relative overflow-hidden rounded-full bg-gradient-to-r from-red-600 via-red-500 to-amber-500 bg-[length:200%_100%] px-8 py-4 text-base font-semibold text-white transition-all duration-500 hover:bg-[position:100%_0] hover:shadow-[0_0_40px_rgba(220,20,60,0.5)] hover:scale-105"
            >
              <span className="relative z-10 flex items-center gap-2">
                Start Building
                <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </span>
            </Link>
            <Link
              href="/register?redirect=/app/demo"
              className="group rounded-full border border-white/20 bg-white/5 px-8 py-4 text-base font-medium text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:border-amber-500/30"
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Try Interactive Demo
              </span>
            </Link>
          </div>

          {/* Hero Visual - Dashboard Preview */}
          <div 
            className="relative mx-auto max-w-5xl"
            style={{ animation: "scaleIn 1s ease forwards 0.5s", animationFillMode: "both" }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 via-amber-500/20 to-red-600/20 blur-3xl" />
            <div className="relative glass-card rounded-2xl p-2 overflow-hidden" style={{ animation: "borderGlow 4s ease infinite" }}>
              <div className="rounded-xl bg-slate-900/90 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <div className="flex-1 h-6 rounded-lg bg-slate-800 flex items-center px-3">
                    <span className="text-xs text-slate-500">app.kharchapay.com/dashboard</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-1 space-y-3">
                    <div className="h-8 rounded-lg bg-gradient-to-r from-red-600/20 to-transparent" />
                    <div className="h-6 rounded bg-slate-800 w-3/4" />
                    <div className="h-6 rounded bg-slate-800 w-full" />
                    <div className="h-6 rounded bg-slate-800 w-2/3" />
                    <div className="h-6 rounded bg-slate-800 w-full" />
                  </div>
                  <div className="col-span-3 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="glass-card rounded-xl p-4">
                        <div className="text-xs text-slate-500 mb-1">Total Spent</div>
                        <div className="text-xl font-bold text-white">रू 8,47,290</div>
                        <div className="text-xs text-green-400 flex items-center gap-1 mt-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                          12.5%
                        </div>
                      </div>
                      <div className="glass-card rounded-xl p-4">
                        <div className="text-xs text-slate-500 mb-1">Pending</div>
                        <div className="text-xl font-bold text-white">23</div>
                        <div className="text-xs text-amber-400 mt-1">Needs review</div>
                      </div>
                      <div className="glass-card rounded-xl p-4">
                        <div className="text-xs text-slate-500 mb-1">On-Chain</div>
                        <div className="text-xl font-bold text-white">156 txns</div>
                        <div className="text-xs text-emerald-400 mt-1">Verified</div>
                      </div>
                    </div>
                    <div className="glass-card rounded-xl p-4 h-32">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs text-slate-500">Spend Trend</span>
                        <span className="text-xs text-red-400">Last 30 days</span>
                      </div>
                      <svg viewBox="0 0 400 60" className="w-full">
                        <defs>
                          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#DC143C" />
                            <stop offset="100%" stopColor="#FF9933" />
                          </linearGradient>
                          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#DC143C" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#DC143C" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M0,50 Q50,45 100,30 T200,35 T300,20 T400,10" fill="none" stroke="url(#lineGradient)" strokeWidth="2" />
                        <path d="M0,50 Q50,45 100,30 T200,35 T300,20 T400,10 L400,60 L0,60 Z" fill="url(#areaGradient)" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* Trusted By / Stats Section */}
      <section className="relative py-24 border-t border-stone-800/40">
        {/* Mountain backdrop */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=1920&q=80"
            alt="Nepal Mountains"
            fill
            className="object-cover opacity-8"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#18181B] via-transparent to-[#18181B]" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="text-center mb-12">
            <p className="text-slate-500 text-sm uppercase tracking-wider mb-4">Trusted by forward-thinking organizations</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: 99.9, suffix: "%", label: "Uptime SLA" },
              { value: 500, suffix: "ms", label: "Avg Response" },
              { value: 10000, suffix: "+", label: "Transactions" },
              { value: 50, suffix: "+", label: "Organizations" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">
                  <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-slate-500 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="relative py-24 border-t border-stone-800/40">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              How it <span className="gradient-text">Works</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              From setup to settlement — as straightforward as a Himalayan sunrise
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <TimelineStep
              number={1}
              title="Create Your Organization"
              description="Set up your org with a one-time blockchain verification. Configure departments, budgets, and approval policies tailored to your workflow."
              delay={0}
            />
            <TimelineStep
              number={2}
              title="Submit & Approve Expenses"
              description="Staff submit expense requests with receipts. Multi-tier approval workflows ensure compliance. Real-time notifications keep everyone in sync."
              delay={200}
            />
            <TimelineStep
              number={3}
              title="Execute On-Chain Payments"
              description="Approved expenses are paid via Solana Token-2022 with immutable memos. Every transaction is cryptographically verifiable and audit-ready."
              delay={400}
              isLast
            />
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section id="features" className="relative py-24 border-t border-stone-800/40">
        {/* Temple silhouette background */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1558799401-1dcba79f0cf8?w=1920&q=80"
            alt="Nepal Temple"
            fill
            className="object-cover opacity-[0.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#18181B] via-[#18181B]/95 to-[#18181B]" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Built for <span className="gradient-text">Enterprise</span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Rock-solid like the Himalayas, modern as tomorrow
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <BentoCard className="md:col-span-2" delay={0}>
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 rounded-full bg-red-600/10 border border-red-600/30 px-3 py-1 text-xs text-red-400 mb-4">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 7a1 1 0 112 0v4a1 1 0 11-2 0V7zm1 8a1 1 0 100-2 1 1 0 000 2z"/></svg>
                    Treasury Management
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Multi-Wallet Treasury</h3>
                  <p className="text-slate-400 mb-6">Hot, warm, and operational wallets with configurable spend policies. Circuit breakers and safety controls protect your funds.</p>
                  <div className="flex gap-4">
                    <div className="glass-card rounded-lg px-4 py-2">
                      <div className="text-xs text-slate-500">Hot Wallet</div>
                      <div className="text-lg font-semibold text-white">रू 50L limit</div>
                    </div>
                    <div className="glass-card rounded-lg px-4 py-2">
                      <div className="text-xs text-slate-500">Daily Cap</div>
                      <div className="text-lg font-semibold text-white">रू 1Cr</div>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 w-48 h-48 rounded-2xl bg-gradient-to-br from-red-600/20 to-amber-500/20 flex items-center justify-center">
                  <svg className="w-24 h-24 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </BentoCard>

            <BentoCard delay={100}>
              <div className="h-full flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Bank-Grade Security</h3>
                <p className="text-slate-400 flex-1">CSRF protection, step-up re-auth, AES-256 encryption, and immutable audit logs.</p>
                <div className="mt-4 flex items-center gap-2 text-indigo-300 text-sm">
                  <span className="flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                  </span>
                  SOC 2 Ready
                </div>
              </div>
            </BentoCard>

            <BentoCard delay={200}>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-green-500 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Smart Approvals</h3>
              <p className="text-slate-400">Multi-tier approval policies with amount thresholds. Separation of duties enforced by default.</p>
            </BentoCard>

            <BentoCard delay={300}>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Instant Settlement</h3>
              <p className="text-slate-400">Payments settle in seconds on Solana. No T+2 delays. Real-time treasury visibility.</p>
            </BentoCard>

            <BentoCard delay={400}>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-600 to-red-500 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">QuickBooks Sync</h3>
              <p className="text-slate-400">Bidirectional sync with QuickBooks Online. Auto-reconcile bills and payments.</p>
            </BentoCard>

            <BentoCard className="md:col-span-2" delay={500}>
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="flex-shrink-0 w-48 h-48 rounded-2xl overflow-hidden relative">
                  <Image
                    src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&q=80"
                    alt="Finance Documents"
                    fill
                    className="object-cover opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-red-600/40 to-amber-500/40" />
                </div>
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs text-amber-400 mb-4">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                    Procure-to-Pay
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Complete P2P Workflow</h3>
                  <p className="text-slate-400 mb-6">Purchase orders, goods receipts, and invoices with 2-way and 3-way matching. Full audit trail from requisition to payment.</p>
                  <div className="flex flex-wrap gap-2">
                    {["PO Management", "GRN Tracking", "Invoice Matching", "GL Coding"].map((tag) => (
                      <span key={tag} className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </BentoCard>

            <BentoCard delay={600}>
              <div className="h-full flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-stone-600 to-stone-500 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Role-Based Access</h3>
                <p className="text-slate-400 flex-1">Admin, Approver, Staff, and Auditor roles with granular permissions. AUDITOR gets read-only access for compliance.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { role: "Admin", color: "bg-red-500" },
                    { role: "Approver", color: "bg-amber-500" },
                    { role: "Staff", color: "bg-emerald-500" },
                    { role: "Auditor", color: "bg-indigo-400" }
                  ].map(({ role, color }) => (
                    <div key={role} className="text-xs text-slate-500 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
                      {role}
                    </div>
                  ))}
                </div>
              </div>
            </BentoCard>
          </div>
        </div>
      </section>

      {/* Nepal-inspired Divider */}
      <div className="relative py-20">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full max-w-7xl px-6">
            <div className="h-px bg-gradient-to-r from-transparent via-stone-500/20 to-transparent" />
          </div>
        </div>
        <div className="relative flex justify-center">
          <div className="bg-[#18181B] px-8">
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-gradient-to-br from-indigo-500 to-violet-400 opacity-60" />
              <div className="w-1 h-1 rounded-full bg-stone-100/40" />
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-600 via-red-500 to-amber-500 flex items-center justify-center shadow-lg shadow-red-900/30">
                <span className="text-white text-2xl">ॐ</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-stone-100/40" />
              <div className="w-2 h-2 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 opacity-60" />
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <section className="relative py-24">
        <div className="absolute inset-0 z-0 overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=1920&q=80"
            alt="Himalayan Sunset"
            fill
            className="object-cover opacity-10"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#18181B] via-[#18181B]/90 to-[#18181B]" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <div className="glass-card rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 via-amber-500/10 to-red-600/10" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to modernize your treasury?
              </h2>
              <p className="text-slate-400 mb-8 max-w-xl mx-auto">
                Join forward-thinking organizations using blockchain-verified payments. 
                One-time setup, no recurring fees.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link
                  href="/register?redirect=/onboarding/create-org"
                  className="group relative overflow-hidden rounded-full bg-gradient-to-r from-red-600 via-red-500 to-amber-500 bg-[length:200%_100%] px-8 py-4 text-base font-semibold text-white transition-all duration-500 hover:bg-[position:100%_0] hover:shadow-[0_0_40px_rgba(220,20,60,0.5)] hover:scale-105"
                >
                  Get Started Free
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-full border border-white/20 bg-white/5 px-8 py-4 text-base font-medium text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:border-amber-500/30"
                >
                  View Pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-stone-800/50 py-12">
        <PrayerFlagStrip />
        <div className="mx-auto max-w-7xl px-6 pt-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 via-red-500 to-amber-500 flex items-center justify-center shadow-lg shadow-red-900/30">
                <span className="text-white font-bold text-lg">ख</span>
              </div>
              <span className="font-bold text-white text-xl tracking-tight">KharchaPay</span>
            </div>
            
            <div className="flex items-center gap-8 text-sm text-stone-500">
              <Link href="/whitepaper" className="hover:text-stone-200 transition-colors">Whitepaper</Link>
              <Link href="/pricing" className="hover:text-stone-200 transition-colors">Pricing</Link>
              <Link href="/login" className="hover:text-stone-200 transition-colors">Sign in</Link>
            </div>

            <div className="flex items-center gap-2 text-sm text-stone-600">
              <span>Crafted in</span>
              <span className="text-red-500 font-medium">Nepal</span>
              <span>🇳🇵</span>
              <span className="mx-2 text-stone-700">·</span>
              <span className="text-stone-500">Powered by Solana</span>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-stone-800/30 text-center">
            <p className="text-xs text-stone-600">
              Built with care, like handwoven dhaka
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
