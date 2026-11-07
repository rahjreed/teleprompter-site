import React, { useState, useEffect, useRef } from 'react';
import { 
  Instagram, 
  ExternalLink, 
  CheckCircle2, 
  ArrowRight, 
  ChevronRight, 
  User, 
  Layout, 
  Zap, 
  History,
  Sparkles,
  Globe,
  Loader2,
  Camera,
  Star,
  ShieldCheck,
  ZapOff,
  ShoppingBag,
  Timer,
  CreditCard,
  Clock,
  Mail,
  XCircle,
  Info,
  Home,
  Network,
  X
} from 'lucide-react';

const apiKey = "";

// Reusable Scroll Reveal Component
const ScrollReveal = ({ children, width = "w-full" }) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) observer.unobserve(ref.current);
    };
  }, []);

  return (
    <div 
      ref={ref} 
      className={`${width} transition-all duration-1000 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      {children}
    </div>
  );
};

// Countdown Timer Component
const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = new Date(targetDate).getTime() - now;

      if (distance < 0) {
        clearInterval(timer);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      } else {
        setTimeLeft({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  const TimeBlock = ({ value, label }) => (
    <div className="flex flex-col items-center flex-1">
      <div className="w-full h-12 flex items-center justify-center bg-slate-950 border border-amber-500/20 rounded-xl mb-1">
        <span className="text-xl font-black text-white">{value}</span>
      </div>
      <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>
    </div>
  );

  return (
    <div className="flex justify-center items-center space-x-2 w-full">
      <TimeBlock value={timeLeft.days} label="Days" />
      <span className="text-amber-500 font-bold mb-4">:</span>
      <TimeBlock value={timeLeft.hours} label="Hours" />
      <span className="text-amber-500 font-bold mb-4">:</span>
      <TimeBlock value={timeLeft.minutes} label="Mins" />
      <span className="text-amber-500 font-bold mb-4">:</span>
      <TimeBlock value={timeLeft.seconds} label="Secs" />
    </div>
  );
};

// Glowing Button Component
const GlowingButton = ({ 
  onClick, 
  children, 
  className = "", 
  isLink = false, 
  href = "", 
  small = false,
  theme = "gold",
  variant = "spin" // "spin" or "none"
}) => {
  const themes = {
    gold: {
      spark: "conic-gradient(from 90deg at 50% 50%, transparent 0%, transparent 25%, #D4AF37 30%, transparent 35%, transparent 100%)",
      shadow: "shadow-[0_20px_40px_-15px_rgba(212,175,55,0.3)]",
      border: "border-amber-500/20"
    },
    silver: {
      spark: "conic-gradient(from 90deg at 50% 50%, transparent 0%, transparent 25%, #94a3b8 30%, transparent 35%, transparent 100%)",
      shadow: "shadow-[0_20px_40px_-15px_rgba(148,163,184,0.1)]",
      border: "border-stone-700"
    }
  };

  const currentTheme = themes[theme] || themes.gold;

  const buttonContent = (
    <>
      {variant === 'spin' && (
        <div 
          className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] group-hover:animate-[spin_1.5s_linear_infinite]" 
          style={{ background: currentTheme.spark }}
        />
      )}
      <div className={`relative z-10 bg-slate-950 flex items-center justify-center text-white font-bold w-full h-full rounded-full border ${currentTheme.border} ${small ? 'px-4 py-2 text-[10px]' : 'px-10 py-5 text-base'}`}>
        {children}
      </div>
    </>
  );

  const classes = `group relative p-[1.5px] inline-block overflow-hidden rounded-full transition-all duration-300 hover:scale-[1.03] active:scale-95 ${currentTheme.shadow} ${className}`;

  if (isLink) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {buttonContent}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={classes}>
      {buttonContent}
    </button>
  );
};

const App = () => {
  const [view, setView] = useState('home');
  const [heroImage, setHeroImage] = useState(null);
  const [aboutImage, setAboutImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  useEffect(() => {
    if (!heroImage && !isGenerating) {
      generateImages();
    }
  }, []);

  const generateImages = async () => {
    setIsGenerating(true);
    try {
      const heroPrompt = "Ultra-modern minimalist office, blurred background, navy and gold lighting, cinematic photography";
      const heroRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
        method: "POST",
        body: JSON.stringify({ instances: [{ prompt: heroPrompt }], parameters: { sampleCount: 1 } })
      });
      const heroData = await heroRes.json();
      if (heroData.predictions?.[0]?.bytesBase64Encoded) {
        setHeroImage(`data:image/png;base64,${heroData.predictions[0].bytesBase64Encoded}`);
      }

      const aboutPrompt = "Confident Black woman creative professional, minimalist fashion, warm gold studio lighting, navy shadows";
      const aboutRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
        method: "POST",
        body: JSON.stringify({ instances: [{ prompt: aboutPrompt }], parameters: { sampleCount: 1 } })
      });
      const aboutData = await aboutRes.json();
      if (aboutData.predictions?.[0]?.bytesBase64Encoded) {
        setAboutImage(`data:image/png;base64,${aboutData.predictions[0].bytesBase64Encoded}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const Header = () => (
    <nav className="fixed top-0 left-0 w-full z-50 px-4 py-4">
      <div className="max-w-6xl mx-auto flex justify-between items-center bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-full px-4 md:px-6 py-2 shadow-2xl">
        <div className="flex items-center space-x-2 group cursor-pointer" onClick={() => setView('home')}>
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center transition-transform group-hover:rotate-12">
            <span className="text-slate-950 font-black text-[10px] tracking-tighter uppercase">CD</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white">
            CALLISTA DIGITAL
          </span>
        </div>
        <GlowingButton 
          small 
          theme="silver"
          onClick={() => setView(view === 'home' ? 'contact' : 'home')}
        >
          {view === 'home' ? 'Pricing' : 'Home'}
        </GlowingButton>
      </div>
    </nav>
  );

  const PageOne = () => (
    <div className="relative overflow-hidden bg-slate-950 selection:bg-amber-500/30 text-white w-full font-sans">
      <Header />
      
      {/* Hero Section */}
      <section className="relative min-h-[90vh] md:min-h-screen flex items-center justify-center px-4 md:px-6 pt-24 pb-12 overflow-hidden w-full">
        <div className="absolute inset-0 z-0">
          {heroImage ? (
            <div className="absolute inset-0 transition-opacity duration-1000 opacity-40">
              <img src={heroImage} alt="Background" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/60 to-slate-950" />
            </div>
          ) : (
             <div className="absolute inset-0 bg-slate-900 animate-pulse" />
          )}
        </div>

        <div className="relative z-10 max-w-6xl mx-auto text-center w-full">
          <ScrollReveal>
            <div className="inline-flex items-center space-x-2 px-4 py-2 mb-8 text-[10px] font-black tracking-[0.3em] uppercase bg-amber-500/10 text-amber-500 rounded-full border border-amber-500/20 backdrop-blur-sm">
              <Sparkles className="w-3 h-3" />
              <span>Personal Brand Excellence</span>
            </div>
            <h1 className="text-5xl md:text-9xl font-black tracking-tighter text-white mb-8 leading-[0.9] uppercase">
              LOOK <span className="text-amber-500">LEGIT</span> <br className="hidden md:block" /> 
              <span className="text-white/90">EVERYWHERE.</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 mb-12 leading-relaxed max-w-2xl mx-auto font-light">
              Stop using messy bio links. I build <span className="text-white font-bold underline decoration-amber-500 underline-offset-8 decoration-4">high-performance</span> splash pages for leaders.
            </p>
            <GlowingButton onClick={() => setView('contact')} theme="gold" className="w-full md:w-auto">
              Get Your Page Built
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </GlowingButton>
          </ScrollReveal>
        </div>
      </section>

      {/* The Authority Section */}
      <section className="px-6 py-24 md:py-32 bg-slate-900 relative">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-20 items-center">
              <div className="relative">
                <div className="absolute -top-10 -left-10 w-32 h-32 bg-amber-500/10 blur-[60px] rounded-full" />
                <h2 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-6 md:mb-8">The Authority</h2>
                <p className="text-3xl md:text-6xl font-black leading-[1.1] mb-6 md:mb-8">
                  I replace <span className="text-slate-500">cluttered links</span> with professional power.
                </p>
                <div className="h-1 w-20 bg-amber-500" />
              </div>
              <div className="space-y-8">
                <p className="text-lg md:text-xl text-slate-400 leading-relaxed font-light">
                  Most online creators lose business because their "digital front door" is a mess. I design hosted personal brand splash pages that help you look professional and guide visitors to the next step instantly.
                </p>
                <div className="grid grid-cols-2 gap-4 md:gap-6">
                   <div className="p-5 md:p-6 bg-white/5 rounded-2xl border border-white/5">
                      <p className="text-2xl md:text-3xl font-black text-white">100%</p>
                      <p className="text-[9px] md:text-[10px] uppercase font-bold text-slate-500 tracking-widest">Mobile Optimized</p>
                   </div>
                   <div className="p-5 md:p-6 bg-white/5 rounded-2xl border border-white/5">
                      <p className="text-2xl md:text-3xl font-black text-white">Fast</p>
                      <p className="text-[9px] md:text-[10px] uppercase font-bold text-slate-500 tracking-widest">Turnaround</p>
                   </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Core Expertise Section */}
      <section className="px-6 py-24 md:py-32 max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16 md:mb-20">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500 mb-4">Core Expertise</h2>
            <p className="text-2xl md:text-3xl font-bold">What I Build For You</p>
          </div>
        </ScrollReveal>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {[
            { title: "Splash Page Design", desc: "Minimalist, high-conversion layouts.", icon: <Layout /> },
            { title: "2-Page Strategy", desc: "Brand page + your specific next step.", icon: <ChevronRight /> },
            { title: "Social Traffic Mastery", desc: "Built specifically for profile clicks.", icon: <Zap /> },
            { title: "Turnkey Hosting", desc: "No tech headaches. I host it for you.", icon: <Globe /> }
          ].map((s, i) => (
            <ScrollReveal key={i}>
              <div className="group p-8 md:p-10 h-full rounded-[30px] md:rounded-[40px] bg-slate-900 border border-white/5 hover:border-amber-500/50 hover:bg-slate-800 transition-all duration-500 shadow-2xl">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-950 flex items-center justify-center mb-6 md:mb-8 text-amber-500 group-hover:scale-110 transition-transform">
                  {s.icon}
                </div>
                <h3 className="text-xl md:text-2xl font-bold mb-4">{s.title}</h3>
                <p className="text-slate-400 font-light text-base md:text-lg">{s.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* SaaS Comparison Section */}
      <section className="px-6 py-24 md:py-32 bg-slate-950">
        <ScrollReveal>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20 md:mb-24">
              <h2 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-6">The Infrastructure</h2>
              <h3 className="text-4xl md:text-7xl font-black tracking-tighter uppercase mb-8 leading-none">BUILT DIFFERENT.</h3>
              <p className="text-slate-400 text-lg md:text-xl font-light max-w-3xl mx-auto leading-relaxed">
                Most websites sit on one cheap server. Ours run on the same global edge network used by modern apps — so your site is fast, secure, and maintenance-free.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-0 items-stretch relative">
              {/* Background Halo for Callista Card */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-full lg:w-1/2 h-full bg-amber-500/5 blur-[120px] rounded-full pointer-events-none hidden lg:block" />
              
              {/* Traditional Card */}
              <div className="bg-slate-900/50 p-8 md:p-12 rounded-t-[40px] lg:rounded-tr-none lg:rounded-l-[40px] border border-white/5 border-b-0 lg:border-b lg:border-r-0 relative z-10">
                <div className="flex items-center space-x-4 mb-10">
                   <div className="p-3 bg-slate-800 rounded-xl">
                      <Home className="w-6 h-6 text-slate-500" />
                   </div>
                   <div>
                     <h4 className="text-xl font-bold text-slate-300">Traditional Hosting</h4>
                     <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">"The Single House"</p>
                   </div>
                </div>

                <div className="space-y-8">
                  {[
                    { label: "Server Type", val: "Single Location", icon: <X className="w-4 h-4 text-slate-500" /> },
                    { label: "Load Speed", val: "Variable / Slow", icon: <X className="w-4 h-4 text-slate-500" /> },
                    { label: "Security Updates", val: "Manual / Required", icon: <X className="w-4 h-4 text-slate-500" /> },
                    { label: "Traffic Handling", val: "Struggles Under Traffic", icon: <X className="w-4 h-4 text-slate-500" /> },
                    { label: "Maintenance", val: "Ongoing Effort", icon: <X className="w-4 h-4 text-slate-500" /> }
                  ].map((row, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-white/5 pb-4">
                      <div>
                        <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest mb-1">{row.label}</p>
                        <p className="text-sm text-slate-300 font-medium">{row.val}</p>
                      </div>
                      <div className="shrink-0 ml-4 p-1.5 rounded-full bg-slate-800/50">
                        {row.icon}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Callista Card */}
              <div className="relative bg-slate-900 p-8 md:p-12 rounded-b-[40px] lg:rounded-bl-none lg:rounded-r-[40px] border-2 border-amber-500/30 shadow-[0_0_100px_rgba(212,175,55,0.08)] overflow-hidden z-20">
                {/* Internal highlight glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[100px] pointer-events-none" />
                
                <div className="flex items-center space-x-4 mb-10 relative z-10">
                   <div className="p-3 bg-amber-500/10 rounded-xl">
                      <Network className="w-6 h-6 text-amber-500" />
                   </div>
                   <div>
                     <h4 className="text-xl font-bold text-white">Callista Digital</h4>
                     <p className="text-[9px] text-amber-500 uppercase tracking-widest font-black">"The Global Network"</p>
                   </div>
                </div>

                <div className="space-y-8 relative z-10">
                  {[
                    { label: "Server Type", val: "Global Edge Network", icon: <CheckCircle2 className="w-4 h-4 text-amber-500" /> },
                    { label: "Load Speed", val: "Instant Everywhere", icon: <CheckCircle2 className="w-4 h-4 text-amber-500" /> },
                    { label: "Security Updates", val: "Fully Automated", icon: <CheckCircle2 className="w-4 h-4 text-amber-500" /> },
                    { label: "Traffic Handling", val: "Unlimited Scaling", icon: <CheckCircle2 className="w-4 h-4 text-amber-500" /> },
                    { label: "Maintenance", val: "Zero Required", icon: <CheckCircle2 className="w-4 h-4 text-amber-500" /> }
                  ].map((row, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-amber-500/10 pb-4">
                      <div>
                        <p className="text-[10px] text-amber-500/60 uppercase font-black tracking-widest mb-1">{row.label}</p>
                        <p className="text-sm text-white font-bold tracking-wide">{row.val}</p>
                      </div>
                      <div className="shrink-0 ml-4 p-1.5 rounded-full bg-amber-500/10">
                        {row.icon}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-16 text-center space-y-12">
              <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.5em] text-amber-500/80">
                Modern businesses don't run on single servers anymore.
              </p>
              
              <div className="max-w-4xl mx-auto">
                <p className="text-slate-400 text-sm md:text-base font-light italic leading-relaxed px-4">
                  “Our client sites are hosted on the same global edge infrastructure used by modern streaming platforms and SaaS companies — meaning ultra-fast load times, automatic scaling, and zero downtime.”
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Leaders Stars Section */}
      <section className="px-6 py-24 bg-white text-slate-950 text-center">
        <ScrollReveal>
          <div className="flex justify-center space-x-2 mb-10">
            {[1, 2, 3, 4, 5].map(i => (
              <Star key={i} className="w-8 h-8 md:w-12 md:h-12 text-amber-500 fill-amber-500" />
            ))}
          </div>
          <h2 className="text-4xl md:text-7xl font-black mb-16 tracking-tighter leading-none uppercase text-slate-950">
            TRUSTED BY <br/> MODERN LEADERS.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl mx-auto text-left">
            {[
              { label: "Experience", val: "10+ Years" },
              { label: "Focus", val: "Conversion" },
              { label: "Systems", val: "Custom Built" }
            ].map((stat, i) => (
              <div key={i} className="border-t-4 border-slate-950 pt-8">
                <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-2">{stat.label}</p>
                <p className="text-3xl font-black">{stat.val}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* About Section */}
      <section className="px-6 py-32 max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 bg-slate-900 rounded-[60px] border border-white/5 overflow-hidden">
            <div className="p-10 md:p-24 flex flex-col justify-center">
               <h2 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-8">The Studio</h2>
               <p className="text-3xl md:text-4xl font-bold leading-tight mb-8">
                I help creators replace cluttered bio links with a <span className="italic underline decoration-amber-500 decoration-4">clean brand page.</span>
               </p>
               <p className="text-slate-400 text-lg font-light leading-relaxed">
                 My goal is simple: make you look legit online and give people one clear place to go next—without funnels, tech overwhelm, or complicated systems.
               </p>
               <div className="mt-8 flex items-center space-x-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">CALLISTA DIGITAL STRATEGY</p>
               </div>
            </div>
            <div className="relative min-h-[400px] md:min-h-[600px] bg-slate-950 overflow-hidden">
                {aboutImage && <img src={aboutImage} alt="Founder" className="w-full h-full object-cover opacity-80" />}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Ready CTA */}
      <section className="px-6 py-24 md:py-32 bg-slate-950">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-4xl md:text-6xl font-black mb-12 tracking-tighter leading-none uppercase">
              READY TO <br/> <span className="text-amber-500">GET STARTED?</span>
            </h2>
            <GlowingButton className="w-full md:w-auto" onClick={() => setView('contact')}>
               Get Your Page Built
               <ArrowRight className="ml-2 w-5 h-5" />
            </GlowingButton>
            <p className="mt-10 text-sm text-slate-500 font-medium text-center">
              Founders pricing is available for a limited time. <br/>
              <span className="italic">No pressure — if it’s not a fit, I’ll tell you.</span>
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* Footer */}
      <footer className="px-6 py-20 bg-black text-center border-t border-white/5">
        <div className="max-w-xl mx-auto">
          <Instagram className="w-10 h-10 mx-auto mb-10 text-slate-500 hover:text-amber-500 transition-colors cursor-pointer" />
          <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-[10px] tracking-[0.3em] text-slate-600 font-bold uppercase space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <span>CALLISTA DIGITAL</span>
            </div>
            <span>EST. 2014 • CLEAN PAGES. CLEAR NEXT STEPS.</span>
          </div>
        </div>
      </footer>
    </div>
  );

  const PageTwo = () => (
    <div className="min-h-screen bg-slate-950 flex flex-col text-white selection:bg-amber-500/30 font-sans">
      <Header />
      <main className="flex-grow pt-32 pb-24 px-6 max-w-5xl mx-auto w-full">
        
        {/* Pricing Header */}
        <ScrollReveal>
          <div className="text-center mb-24">
            <div className="inline-block p-4 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl mb-8 animate-bounce">
              <ShoppingBag className="w-10 h-10 text-amber-500" />
            </div>
            <h1 className="text-5xl md:text-8xl font-black text-white mb-6 tracking-tighter leading-none uppercase">
              PRICING <br/>
              <span className="text-amber-500">STRUCTURE.</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-400 font-light max-w-2xl mx-auto leading-relaxed italic">
              Simple. Clear. Built for social-first businesses.
            </p>
          </div>
        </ScrollReveal>

        {/* Intro Text */}
        <ScrollReveal>
          <div className="max-w-3xl mx-auto text-center mb-32 space-y-6">
            <p className="text-2xl font-bold leading-tight">
              I build clean, professional personal brand pages designed to replace messy bio links and guide people to one clear next step.
            </p>
            <p className="text-slate-500 text-lg font-light uppercase tracking-widest">
              No funnels. No forms. No overcomplication.
            </p>
          </div>
        </ScrollReveal>

        {/* One-Time Setup Section */}
        <section className="mb-40">
          <ScrollReveal>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-6">One-Time Setup</h2>
                <h3 className="text-4xl md:text-6xl font-black mb-8 leading-none">PERSONAL BRAND <br/> PAGE BUILD.</h3>
                <p className="text-slate-400 text-lg font-light leading-relaxed mb-10">
                  This build is standardized on purpose. It allows me to deliver quickly, consistently, and at an affordable price.
                </p>
                <div className="space-y-4 mb-10">
                  {[
                    "A custom 2-page personal brand website",
                    "Page 1: Brand + credibility + clarity",
                    "Page 2: Clear next step (DM, call, link, etc.)",
                    "Mobile-first, premium design",
                    "Built specifically for social media traffic",
                    "Hosted setup and launch",
                    "Works for travel reps, creators, and online businesses"
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start space-x-3">
                      <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-slate-300 text-base">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative group" id="pricing-card">
                <div className="absolute inset-0 bg-amber-500/10 blur-[100px] opacity-20" />
                <div className="relative bg-slate-900 p-10 md:p-12 border-2 border-amber-500/30 rounded-[48px] text-center shadow-3xl">
                  <div className="inline-flex items-center space-x-2 px-4 py-1.5 mb-8 text-[10px] font-black tracking-[0.3em] uppercase bg-amber-500 text-slate-950 rounded-full shadow-lg">
                    <Sparkles className="w-3 h-3" />
                    <span>Founder's Pricing</span>
                  </div>
                  <div className="flex flex-col items-center mb-10">
                    <span className="text-slate-500 text-xl font-bold line-through mb-2">$497 Normal</span>
                    <div className="flex items-center">
                      <span className="text-3xl font-black text-slate-500 mt-[-20px] mr-1">$</span>
                      <span className="text-8xl font-black text-white tracking-tighter">297</span>
                    </div>
                    <p className="mt-4 text-[10px] text-amber-500/60 font-black uppercase tracking-widest">Increases to $497 After Feb 1</p>
                  </div>
                  
                  <div className="bg-slate-950/50 p-6 rounded-3xl border border-white/5 mb-10">
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-4 flex items-center justify-center">
                      <Clock className="w-3 h-3 mr-2" />
                      Offer Ends In
                    </p>
                    <CountdownTimer targetDate="February 1, 2026 00:00:00" />
                  </div>

                  {/* Updated button to scroll to monthly plans */}
                  <GlowingButton 
                    variant="none" 
                    className="w-full py-6 text-xl" 
                    onClick={() => document.getElementById('monthly-plans-section')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Secure Your Build
                  </GlowingButton>
                  <p className="mt-6 text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">
                    <ShieldCheck className="w-4 h-4 inline mr-2 text-amber-500" />
                    Select a support plan below
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* Monthly Plans Section */}
        <section className="mb-40" id="monthly-plans-section">
          <ScrollReveal>
            <div className="text-center mb-20">
              <h2 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-6">Monthly Plans</h2>
              <h3 className="text-4xl md:text-5xl font-black mb-6">ONGOING SUPPORT.</h3>
              <p className="text-slate-400 text-lg font-light max-w-2xl mx-auto leading-relaxed">
                Your monthly plan determines ongoing support, not the quality of the build. All sites are built to the same standard.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { 
                  name: "Starter", 
                  price: "$10", 
                  color: "border-green-500/20", 
                  icon: "🟢",
                  desc: "Best if you never plan to make changes.",
                  features: ["Secure hosting + uptime", "Page stays live", "Image hosting", "Your link remains active"],
                  not: "❌ No edits or updates included",
                  reason: "Choose this if your page is “set it and forget it.”",
                  btnText: "Select Starter"
                },
                { 
                  name: "Managed", 
                  price: "$29", 
                  color: "border-amber-500/50", 
                  icon: "⭐",
                  popular: true,
                  desc: "Best for active reps and creators.",
                  features: ["Everything in Starter", "1 small edit per month", "Text or image swaps", "Link or button updates", "Email or DM support"],
                  reason: "Peace of mind without needing to think about your site.",
                  btnText: "Choose Managed"
                },
                { 
                  name: "Pro", 
                  price: "$49", 
                  color: "border-blue-500/20", 
                  icon: "🔵",
                  desc: "Best if you want it handled for you.",
                  features: ["Everything in Managed", "Up to 3 small edits per month", "Priority turnaround", "Light guidance on updates"],
                  reason: "Ideal if you want to stay focused on your business, not your website.",
                  btnText: "Select Pro"
                }
              ].map((plan, i) => (
                <div key={i} className={`relative p-8 rounded-[40px] bg-slate-900 border-2 ${plan.color} flex flex-col h-full overflow-hidden shadow-xl hover:scale-[1.02] transition-transform`}>
                  {plan.popular && <div className="absolute top-5 right-5 bg-amber-500 text-slate-950 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">Most Popular</div>}
                  <div className="text-3xl mb-4">{plan.icon}</div>
                  <h4 className="text-2xl font-black mb-1">{plan.name}</h4>
                  <div className="flex items-baseline mb-6">
                    <span className="text-3xl font-black">{plan.price}</span>
                    <span className="text-slate-500 text-xs font-bold ml-1 tracking-widest uppercase">/ month</span>
                  </div>
                  <p className="text-slate-400 text-sm font-medium mb-8 leading-relaxed italic">{plan.desc}</p>
                  
                  <div className="space-y-4 mb-10 flex-grow">
                    {plan.features.map((f, j) => (
                      <div key={j} className="flex items-start space-x-3">
                        <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 opacity-60" />
                        <span className="text-slate-300 text-xs font-medium">{f}</span>
                      </div>
                    ))}
                    {plan.not && <div className="text-slate-600 text-[10px] font-bold uppercase tracking-widest pt-2">{plan.not}</div>}
                  </div>

                  <div className="mt-auto pt-6 border-t border-white/5 space-y-6">
                    <GlowingButton variant="none" small className="w-full py-4 text-xs tracking-widest uppercase" onClick={() => window.open('https://instagram.com/travelprox', '_blank')}>
                      {plan.btnText}
                    </GlowingButton>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">
                      {plan.reason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </section>

        {/* Small Edit Explanation */}
        <ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 bg-slate-900/50 p-10 md:p-16 rounded-[48px] border border-white/5 mb-40">
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-6">Policy</h2>
              <h3 className="text-3xl md:text-4xl font-black mb-6 uppercase">WHAT COUNTS AS A <br/> “SMALL EDIT”?</h3>
              <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
                These are available separately or as part of a custom build if your needs grow beyond a splash page.
              </p>
            </div>
            <div className="space-y-10">
              <div className="space-y-4">
                <p className="text-[10px] font-black text-white uppercase tracking-widest flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> Includes:
                </p>
                <div className="grid grid-cols-1 gap-2 text-slate-400 text-sm">
                  <span>• Updating existing text</span>
                  <span>• Swapping an image</span>
                  <span>• Changing a link or button</span>
                </div>
              </div>
              <div className="space-y-4 opacity-60">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center">
                  <XCircle className="w-4 h-4 mr-2" /> Does not include:
                </p>
                <div className="grid grid-cols-1 gap-2 text-slate-500 text-sm">
                  <span>• Full redesigns</span>
                  <span>• New additional pages</span>
                  <span>• Copy rewrites or branding</span>
                  <span>• Strategy or marketing funnels</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Enterprise Section */}
        <section className="mb-40">
          <ScrollReveal>
            <div className="bg-amber-500/5 border border-amber-500/20 p-10 md:p-20 rounded-[60px] text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                <Globe className="w-64 h-64 text-amber-500" />
              </div>
              <h2 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-8">Custom Solutions</h2>
              <h3 className="text-4xl md:text-6xl font-black mb-10 tracking-tighter text-center uppercase">ENTERPRISE BUILDS.</h3>
              <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto font-light leading-relaxed mb-12">
                For businesses that need personal hosting, 5+ pages, or fully custom designs. These projects are offered selectively to ensure quality.
              </p>
              
              <div className="flex flex-col items-center">
                <a 
                  href="mailto:contact@travelprox.com"
                  className="group flex items-center text-xs font-black uppercase tracking-[0.4em] text-white bg-slate-900 border border-white/10 px-10 py-5 rounded-full hover:bg-black transition-all shadow-2xl mb-6"
                >
                  <Mail className="w-4 h-4 mr-3 text-amber-500" />
                  Email to request information
                </a>
                <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest max-w-sm leading-relaxed">
                  If it looks like a match, we’ll schedule a Zoom to discuss next steps.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </section>

        <footer className="pt-20 pb-10 flex flex-col md:flex-row justify-between items-center text-[9px] tracking-[0.3em] text-slate-700 font-black uppercase space-y-4 md:space-y-0 border-t border-white/5">
           <span>Clean pages. Clear next steps. Built for social traffic.</span>
           <span>CALLISTA DIGITAL © 2014 - 2026</span>
        </footer>
      </main>
    </div>
  );

  return (
    <div className="font-sans antialiased bg-slate-950 w-full overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      {view === 'home' ? <PageOne /> : <PageTwo />}
    </div>
  );
};

export default App;
