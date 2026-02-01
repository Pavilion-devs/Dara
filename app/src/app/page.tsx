"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/navigation";
import { ArrowRight, Shield, Eye, Zap, Lock, Users, Globe } from "lucide-react";

export default function LandingPage() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();
  const footerTextRef = useRef<HTMLHeadingElement>(null);

  // Redirect to dashboard if already connected
  useEffect(() => {
    if (connected) {
      router.push("/dashboard");
    }
  }, [connected, router]);

  // Scroll reveal
  useEffect(() => {
    const revealElements = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("active");
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    revealElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Footer parallax
  useEffect(() => {
    const handleScroll = () => {
      if (footerTextRef.current) {
        const rect = footerTextRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        if (rect.top < windowHeight) {
          const move = (windowHeight - rect.top) * 0.1;
          footerTextRef.current.style.transform = `translateX(-${move}px)`;
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main className="md:px-8 w-full max-w-[1800px] mt-24 mr-auto ml-auto pr-4 pb-20 pl-4">
      {/* Hero */}
      <section className="pt-10 md:pt-20 pb-12 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end mb-12">
          <div className="lg:col-span-7 reveal active">
            <h1 className="md:text-7xl lg:text-8xl leading-[1.05] text-5xl font-semibold tracking-tighter">
              Anonymous
              <br />
              Token
              <br />
              <span className="text-indigo-500">Presales</span>
            </h1>
          </div>
          <div className="lg:col-span-5 flex flex-col items-start lg:items-end lg:pl-10 reveal delay-100 active">
            <p className="text-lg md:text-xl text-neutral-600 mb-8 max-w-sm lg:text-right font-medium">
              Privacy-preserving presale platform on Solana. Commit anonymously,
              claim privately.
            </p>
            <button
              onClick={() => setVisible(true)}
              className="group flex items-center gap-3 pl-6 pr-6 py-3.5 bg-neutral-900 text-white rounded-full hover:bg-neutral-800 transition-all duration-300 shadow-xl shadow-neutral-900/10 hover:shadow-neutral-900/20 hover:-translate-y-1"
            >
              <span className="text-sm font-semibold">Connect Wallet</span>
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>

        {/* Hero Card */}
        <div className="reveal delay-200 w-full h-[400px] md:h-[550px] rounded-[2rem] md:rounded-[3rem] overflow-hidden relative border border-neutral-200 shadow-sm active">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-neutral-50" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(99,102,241,0.08),transparent_60%)]" />

          {/* Floating cards */}
          <div className="absolute bottom-8 left-8 md:bottom-12 md:left-12 bg-white/95 backdrop-blur-xl p-6 rounded-2xl shadow-2xl max-w-sm w-full hidden md:block border border-white/50">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
                  Active Presale
                </p>
                <h4 className="text-sm font-bold text-neutral-900">
                  $ANON Token Launch
                </h4>
              </div>
              <div className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-600 animate-pulse" />
                Live
              </div>
            </div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-indigo-600">
                  ??
                </div>
                <div className="w-8 h-8 rounded-full bg-neutral-800 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">
                  ??
                </div>
                <div className="w-8 h-8 rounded-full bg-neutral-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-neutral-600">
                  +?
                </div>
              </div>
              <div className="text-xs text-neutral-500 font-medium">
                Anonymous participants
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-medium text-neutral-600">
                <span>Raised</span>
                <span>67%</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 w-[67%] rounded-full" />
              </div>
            </div>
          </div>

          {/* Privacy badge */}
          <div className="absolute top-8 right-8 md:top-12 md:right-12 bg-white/95 backdrop-blur-xl px-5 py-3 rounded-xl shadow-lg border border-white/50 hidden md:flex items-center gap-3">
            <Shield className="w-5 h-5 text-indigo-500" />
            <div>
              <p className="text-xs font-semibold text-neutral-900">
                Commit-Reveal Privacy
              </p>
              <p className="text-[10px] text-neutral-500">
                Unlinkable deposits & claims
              </p>
            </div>
          </div>

          {/* Center graphic */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <div className="w-32 h-32 md:w-48 md:h-48 rounded-full border-2 border-dashed border-indigo-200 animate-[spin_20s_linear_infinite] flex items-center justify-center">
                <div className="w-20 h-20 md:w-28 md:h-28 rounded-full border border-indigo-300 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                  <Lock className="w-8 h-8 md:w-12 md:h-12 text-indigo-500 stroke-[1.5]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent my-16 opacity-50" />

      {/* How It Works - Dark Section */}
      <section className="rounded-[2rem] md:rounded-[3rem] bg-[#111111] text-white p-8 md:p-16 lg:p-24 overflow-hidden relative reveal">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 relative z-10">
          <div className="flex flex-col justify-center">
            <div className="mb-8 flex items-center gap-2 text-neutral-400 text-sm font-medium tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              How It Works
            </div>
            <h2 className="text-5xl md:text-7xl font-semibold tracking-tighter leading-tight mb-8">
              Commit.
              <span className="flex items-center gap-4 text-neutral-500">
                <Eye className="w-12 h-12 md:w-16 md:h-16 stroke-[1.5]" />
                Reveal.
              </span>
              Claim.
            </h2>
            <p className="text-xl md:text-2xl text-neutral-400 max-w-md leading-relaxed">
              Use a burner wallet to commit SOL with a hashed secret. After the
              presale ends, reveal your secret to claim tokens to a completely
              separate wallet.
            </p>
          </div>
          <div className="relative mt-8 lg:mt-0">
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-2xl">
              <div className="space-y-6">
                {/* Step 1 */}
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-sm font-bold shrink-0">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">
                      Generate Burner Wallet
                    </h4>
                    <p className="text-neutral-500 text-sm">
                      A fresh keypair is created in your browser. Fund it with
                      SOL from your main wallet.
                    </p>
                  </div>
                </div>
                {/* Step 2 */}
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-sm font-bold shrink-0">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">
                      Commit Anonymously
                    </h4>
                    <p className="text-neutral-500 text-sm">
                      Your burner signs the transaction with a commitment hash.
                      No link to your real wallet on-chain.
                    </p>
                  </div>
                </div>
                {/* Step 3 */}
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-sm font-bold shrink-0">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">
                      Claim to Fresh Wallet
                    </h4>
                    <p className="text-neutral-500 text-sm">
                      Reveal your secret and claim tokens to any wallet. The
                      chain can&apos;t link your deposit to your claim.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 bg-[#222] rounded-xl p-6 border border-neutral-700">
                <div className="flex justify-between text-xs font-medium text-neutral-500 mb-4">
                  <span className="text-white">Privacy Guarantee</span>
                  <span>Solana Devnet</span>
                </div>
                <div className="text-4xl font-mono text-white mb-2 text-center tracking-widest font-light">
                  SHA-256
                </div>
                <div className="text-neutral-500 text-sm mb-6 text-center">
                  Commitment Hash Scheme
                </div>
                <button
                  onClick={() => setVisible(true)}
                  className="w-full py-3.5 bg-white text-black text-sm font-bold rounded-full hover:bg-neutral-200 hover:scale-[1.02] active:scale-95 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                >
                  Launch App
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full h-px bg-neutral-200 my-20" />

      {/* Features */}
      <section className="py-12 md:py-24 relative reveal">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-8">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold tracking-widest text-neutral-500 uppercase mb-4">
              Features
            </div>
            <h2 className="md:text-5xl lg:text-6xl leading-[1.1] text-4xl font-semibold text-neutral-900 tracking-tighter">
              Privacy-first token launches on Solana.
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          <div className="relative bg-indigo-100 rounded-3xl p-8 flex flex-col min-h-[320px] hover:scale-[1.01] transition-transform duration-300">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-indigo-700" />
              <span className="text-sm font-medium text-neutral-800">
                Anonymous Commits
              </span>
            </div>
            <p className="text-neutral-600 text-sm mt-2 max-w-xs">
              Use burner wallets with commitment hashes. Your identity stays
              hidden throughout the presale.
            </p>
            <div className="text-5xl md:text-6xl font-semibold text-black tracking-tighter mb-1 mt-auto">
              Zero
              <span className="text-sm font-sans font-medium tracking-normal align-middle opacity-60 ml-2">
                IDENTITY LEAK
              </span>
            </div>
          </div>
          <div className="bg-neutral-50 rounded-3xl p-8 flex flex-col min-h-[320px] hover:bg-neutral-100 transition-colors duration-300">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-neutral-600" />
              <span className="text-sm font-medium text-neutral-600">
                Anoncoin Integration
              </span>
            </div>
            <p className="text-neutral-500 text-sm mt-2 max-w-xs">
              Create tokens directly via Anoncoin&apos;s API. One-click launch
              with automatic presale setup.
            </p>
            <div className="text-5xl md:text-6xl font-semibold text-black tracking-tighter mb-1 mt-auto">
              1-Click
              <span className="text-sm font-sans font-medium tracking-normal align-middle opacity-60 ml-2">
                TOKEN LAUNCH
              </span>
            </div>
          </div>
          <div className="bg-neutral-50 rounded-3xl p-8 flex flex-col min-h-[320px] hover:bg-neutral-100 transition-colors duration-300">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-neutral-600" />
              <span className="text-sm font-medium text-neutral-600">
                Social Gating
              </span>
            </div>
            <p className="text-neutral-500 text-sm mt-2 max-w-xs">
              Optional Twitter verification to ensure real community
              participation while preserving on-chain privacy.
            </p>
            <div className="text-5xl md:text-6xl font-semibold text-black tracking-tighter mb-1 mt-auto">
              Sybil
              <span className="text-sm font-sans font-medium tracking-normal align-middle opacity-60 ml-2">
                RESISTANT
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mb-20">
        <div className="relative w-full rounded-[2.5rem] bg-[#111111] overflow-hidden px-8 py-20 md:py-32 text-center reveal">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center">
            <h2 className="text-5xl md:text-7xl lg:text-8xl font-semibold text-white tracking-tighter leading-none mb-8">
              Ready to
              <br />
              Go Private?
            </h2>
            <p className="text-neutral-400 text-lg md:text-xl mb-10 max-w-lg leading-relaxed">
              Launch your token presale with built-in anonymity. No KYC, no
              tracking, just cryptographic privacy guarantees.
            </p>
            <div className="flex flex-col md:flex-row items-center gap-4 w-full justify-center">
              <button
                onClick={() => setVisible(true)}
                className="px-10 py-4 bg-white text-black rounded-full text-base font-bold hover:bg-neutral-200 hover:scale-105 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.15)] min-w-[200px]"
              >
                Connect Wallet
              </button>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-10 py-4 bg-transparent border border-neutral-700 text-white rounded-full text-base font-semibold hover:border-white transition-all duration-300 min-w-[200px]"
              >
                View Source
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="mt-20 overflow-hidden border-t border-black pt-12 relative">
        <div className="w-full overflow-hidden py-10">
          <h1
            ref={footerTextRef}
            className="text-[15vw] leading-[0.8] uppercase whitespace-nowrap select-none transition-transform duration-75 will-change-transform font-bold text-black tracking-tighter"
            style={{ transform: "translateX(0)" }}
          >
            AnonPresale Protocol
          </h1>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mt-8 gap-6 pb-12 reveal">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center border border-neutral-200">
              <Globe className="w-5 h-5" />
            </div>
            <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center border border-neutral-200">
              <Shield className="w-5 h-5" />
            </div>
          </div>
          <div className="text-sm font-medium text-neutral-500">
            Built for the Anoncoin Hackathon on Solana Devnet
          </div>
          <div className="text-sm font-medium text-neutral-400">
            Powered by Anoncoin
          </div>
        </div>
      </section>
    </main>
  );
}
