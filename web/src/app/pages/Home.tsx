import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { motion, useInView } from "motion/react";
import {
  Search,
  BookOpen,
  GraduationCap,
  Star,
  ChevronRight,
  Sparkles,
  Users,
  ArrowRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";


// ------- Animated count-up -------
function CountUp({ end, suffix = "", duration = 1800 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView) return;
    let startTime: number | null = null;
    const frame = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(frame);
      else setCount(end);
    };
    requestAnimationFrame(frame);
  }, [inView, end, duration]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

// ------- Hero background blobs -------
function HeroBlobs() {
  return (
    <>
      {/* Top-right large gold orb */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 700,
          height: 700,
          top: "-20%",
          right: "-10%",
          background: "radial-gradient(circle at 40% 40%, rgba(255,200,69,0.14), transparent 65%)",
          filter: "blur(40px)",
        }}
        animate={{ y: [0, -35, 0], x: [0, 18, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Bottom-left soft orb */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 500,
          height: 500,
          bottom: "0%",
          left: "-8%",
          background: "radial-gradient(circle at 60% 60%, rgba(255,255,255,0.07), transparent 60%)",
          filter: "blur(50px)",
        }}
        animate={{ y: [0, 22, 0], x: [0, -12, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      {/* Center-left small warm orb */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 280,
          height: 280,
          top: "35%",
          left: "8%",
          background: "radial-gradient(circle at 50% 50%, rgba(255,200,69,0.09), transparent 70%)",
          filter: "blur(30px)",
        }}
        animate={{ y: [0, -18, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />
      {/* Top-center very subtle glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 400,
          height: 200,
          top: "5%",
          left: "50%",
          transform: "translateX(-50%)",
          background: "radial-gradient(circle at 50% 50%, rgba(255,200,69,0.06), transparent 70%)",
          filter: "blur(40px)",
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

// ------- Feature cards data -------
const features = [
  {
    icon: BookOpen,
    title: "Browse Courses",
    description: "Explore 500+ courses at McMaster with detailed descriptions, prerequisites, and availability.",
    link: "/courses",
    cta: "View All Courses",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/50",
  },
  {
    icon: Star,
    title: "Student Reviews",
    description: "Read honest, verified reviews from students who've taken the courses — the good and the hard.",
    link: "/courses",
    cta: "Browse Reviews",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/50",
  },
  {
    icon: GraduationCap,
    title: "Degree Planner",
    description: "Plan your entire academic journey with our interactive drag-and-drop degree planning tool.",
    link: "/planner",
    cta: "Plan Your Degree",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
  },
];

// ------- Main Component -------
export function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/courses?search=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate("/courses");
    }
  };

  return (
    <div>
      {/* ══════════════════════════════════════════
          HERO SECTION
      ══════════════════════════════════════════ */}
      <section className="relative overflow-hidden min-h-[88vh] flex items-center" style={{ background: "linear-gradient(135deg, #7A003C 0%, #5a0028 55%, #3d0018 100%)" }}>

        {/* Dot grid pattern */}
        <div
          className="absolute inset-0 opacity-100 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,200,69,0.12) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Animated background blobs */}
        <HeroBlobs />

        {/* Content */}
        <div className="relative z-10 container mx-auto px-4 py-24 text-center">

          {/* Badge chip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mb-8"
          >
            <span className="flex h-2 w-2 rounded-full bg-[#ffc845] animate-pulse" />
            <Sparkles className="h-3.5 w-3.5 text-[#ffc845]" />
            <span className="text-[#ffc845] text-sm font-medium">McMaster University Course Explorer</span>
          </motion.div>

          {/* Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.21, 1.11, 0.81, 0.99] }}
            className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight"
            style={{ textShadow: "0 2px 30px rgba(0,0,0,0.25)" }}
          >
            Explore{" "}
            <span
              className="relative inline-block"
              style={{
                background: "linear-gradient(90deg, #ffc845, #ffd96b, #ffc845)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              McMaster
            </span>
            <br />
            <span className="text-white/90">University Courses</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="text-lg md:text-xl text-white/75 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Browse 500+ courses, read real student reviews, rate professors,
            and plan your entire degree with our interactive tools.
          </motion.p>

          {/* Search bar */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            onSubmit={handleSearch}
            className="max-w-2xl mx-auto mb-8"
          >
            <div className="flex gap-3 bg-white/10 backdrop-blur-md border border-white/25 rounded-2xl p-2 shadow-2xl focus-within:border-[#ffc845]/60 transition-colors">
              <div className="relative flex-1 flex items-center">
                <Search className="absolute left-3 h-5 w-5 text-white/50 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search courses, professors, departments…"
                  className="w-full bg-transparent pl-10 pr-4 py-2.5 text-white placeholder:text-white/45 outline-none text-base"
                />
              </div>
              <Button
                type="submit"
                className="bg-[#ffc845] text-[#7A003C] hover:bg-[#ffd96b] font-semibold px-6 rounded-xl shrink-0 shadow-lg"
              >
                Search
              </Button>
            </div>
          </motion.form>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="flex items-center justify-center gap-6 md:gap-10 mb-12 flex-wrap"
          >
            {[
              { value: 500, suffix: "+", label: "Courses" },
              { value: 10000, suffix: "+", label: "Reviews" },
              { value: 200, suffix: "+", label: "Professors" },
              { value: 50, suffix: "+", label: "Programs" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-[#ffc845]">
                  <CountUp end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-white/55 text-sm mt-0.5">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.65 }}
            className="flex gap-4 justify-center flex-wrap"
          >
            <Button
              asChild
              size="lg"
              className="bg-[#ffc845] text-[#7A003C] hover:bg-[#ffd96b] font-semibold rounded-xl px-8 shadow-lg hover:shadow-xl transition-all"
            >
              <Link to="/courses">
                Browse All Courses
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/30 text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl px-8"
            >
              <Link to="/planner">Plan Your Degree</Link>
            </Button>
          </motion.div>
        </div>

        {/* Wave transition to page body */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg
            viewBox="0 0 1440 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            className="w-full"
          >
            <path
              d="M0 72L1440 72L1440 30C1200 68 900 4 720 36C540 68 240 2 0 36L0 72Z"
              className="fill-background"
            />
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FEATURE CARDS
      ══════════════════════════════════════════ */}
      <section className="container mx-auto px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Everything You Need to Succeed
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Tools built by McMaster students, for McMaster students.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
            >
              <Card className="h-full group hover:shadow-lg hover:border-primary/30 transition-all duration-200 hover:-translate-y-0.5">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${feature.bg}`}>
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                    <Link to={feature.link} className="flex items-center justify-center gap-2">
                      {feature.cta}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>



      {/* ══════════════════════════════════════════
          STATS BAND
      ══════════════════════════════════════════ */}
      <section className="mx-4 md:mx-auto container my-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: "linear-gradient(135deg, #7A003C 0%, #5a0028 100%)" }}
        >
          <div
            className="p-10 md:p-14"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(255,200,69,0.08) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { icon: BookOpen, value: 500, suffix: "+", label: "Courses Available" },
                { icon: Star, value: 10000, suffix: "+", label: "Student Reviews" },
                { icon: Users, value: 200, suffix: "+", label: "Professors Rated" },
                { icon: GraduationCap, value: 50, suffix: "+", label: "Programs Covered" },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-1">
                    <stat.icon className="h-6 w-6 text-[#ffc845]" />
                  </div>
                  <div className="text-4xl font-bold text-[#ffc845]">
                    <CountUp end={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="text-white/65 text-sm">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>



      {/* ══════════════════════════════════════════
          BOTTOM CTA
      ══════════════════════════════════════════ */}
      <section className="container mx-auto px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="relative rounded-2xl overflow-hidden"
          style={{ background: "linear-gradient(135deg, #7A003C 0%, #5a0028 100%)" }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(255,200,69,0.08) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative z-10 p-10 md:p-14 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Plan Your Academic Journey?
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto mb-8">
              Join thousands of McMaster students using MacTrack to make smarter course decisions.
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button
                asChild
                size="lg"
                className="bg-[#ffc845] text-[#7A003C] hover:bg-[#ffd96b] font-semibold rounded-xl px-8 shadow-lg"
              >
                <Link to="/signup">Get Started Free</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 text-white bg-white/10 hover:bg-white/20 rounded-xl px-8"
              >
                <Link to="/courses">Browse Courses</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}