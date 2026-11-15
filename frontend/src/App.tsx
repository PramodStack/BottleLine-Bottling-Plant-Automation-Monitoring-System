import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Circle, Eye, EyeOff, ArrowLeft, Loader2, Check } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlantDataProvider } from './context/PlantDataContext';
import { ToolbarProvider } from './context/ToolbarContext';
import { AiAssistantProvider } from './context/AiAssistantContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import { LandingPage } from './pages/LandingPage';
import { DashboardLayout } from './layouts/DashboardLayout';
import { OverviewPage } from './pages/OverviewPage';
import { ProductionPage } from './pages/ProductionPage';
import { BottleTrackingPage } from './pages/BottleTrackingPage';
import { InspectionPage } from './pages/InspectionPage';
import { CappingPage } from './pages/CappingPage';
import { PackagingPage } from './pages/PackagingPage';
import { HistoryPage } from './pages/HistoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { ProfilePage } from './pages/ProfilePage';
import { KageLandingPage } from './pages/KageLandingPage';
import { LoadingState } from './components/common/LoadingState';
import { GlobalFullscreenButton } from './components/common/GlobalFullscreenButton';

// Protected Route Guard
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen atmospheric-bg flex items-center justify-center">
        <LoadingState message="Verifying operator credentials..." size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Role-Based Admin Route Guard (Restricted to Owner & Super Admin)
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { canManageUsers, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingState message="Verifying administrative privileges..." />
      </div>
    );
  }

  if (!canManageUsers) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
        <div className="w-16 h-16 rounded-3xl bg-[rgba(239,68,68,0.18)] border border-[rgba(239,68,68,0.35)] flex items-center justify-center text-red-400 mb-4 shadow-[0_0_24px_rgba(239,68,68,0.2)]">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Access Restricted</h2>
        <p className="text-xs text-[#cbd5e1] max-w-sm mb-5 leading-relaxed">
          User Management and Role-Based Access Control is restricted to application Owner and Super Admin accounts.
        </p>
        <a
          href="/dashboard"
          className="px-4 py-2 rounded-full bg-[rgba(55,75,96,0.6)] hover:bg-[rgba(68,90,114,0.8)] border border-[rgba(210,226,240,0.25)] text-white text-xs font-semibold backdrop-blur-md transition-all shadow-sm"
        >
          Return to Overview
        </a>
      </div>
    );
  }

  return <>{children}</>;
};

// Public Route Guard (Redirects to dashboard if already authenticated)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingState message="Loading..." size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <BrowserRouter>
      <GlobalFullscreenButton />
      <ToastProvider>
        <NotificationProvider>
          <AuthProvider>
            <PlantDataProvider>
              <ToolbarProvider>
                <AiAssistantProvider>
                  <Routes>
                    {/* Public Landing (PULSE Kage 3D Landing Page) */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/kage" element={<KageLandingPage />} />
                    <Route path="/landing-pages/kage" element={<KageLandingPage />} />

                    {/* Aurora Registration & Login ("use this login and signup page") */}
                    <Route
                      path="/signup"
                      element={
                        <PublicRoute>
                          <AuroraSignUp initialMode="signup" />
                        </PublicRoute>
                      }
                    />
                    <Route
                      path="/register"
                      element={
                        <PublicRoute>
                          <AuroraSignUp initialMode="signup" />
                        </PublicRoute>
                      }
                    />
                    <Route
                      path="/login"
                      element={
                        <PublicRoute>
                          <AuroraSignUp initialMode="login" />
                        </PublicRoute>
                      }
                    />
                    <Route path="/aurora" element={<AuroraSignUp initialMode="signup" />} />

                    {/* Protected Dashboard Routes */}
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <DashboardLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<OverviewPage />} />
                      <Route path="production" element={<ProductionPage />} />
                      <Route path="bottle-tracking" element={<BottleTrackingPage />} />
                      <Route path="inspection" element={<InspectionPage />} />
                      <Route path="capping" element={<CappingPage />} />
                      <Route path="packaging" element={<PackagingPage />} />
                      <Route path="history" element={<HistoryPage />} />
                      <Route
                        path="users"
                        element={
                          <AdminRoute>
                            <UserManagementPage />
                          </AdminRoute>
                        }
                      />
                      <Route path="reports" element={<ReportsPage />} />
                      <Route path="profile" element={<ProfilePage />} />
                    </Route>

                    {/* Direct /profile Route */}
                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <DashboardLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<ProfilePage />} />
                    </Route>

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AiAssistantProvider>
              </ToolbarProvider>
            </PlantDataProvider>
          </AuthProvider>
        </NotificationProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

/* ══════════════════════════════════════════════════════════════
   AURORA SIGN UP & LOGIN INTERFACE (WITH REMEMBER PASSWORD)
   ══════════════════════════════════════════════════════════════ */

const REMEMBER_STORAGE_KEY = 'aurora_remembered_credentials';

export function AuroraSignUp({
  initialMode = 'signup',
}: {
  initialMode?: 'signup' | 'login';
}) {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let authContext: any = null;
  try {
    authContext = useAuth();
  } catch {
    // Graceful fallback if rendered outside AuthProvider
  }

  let navigate: any = null;
  try {
    navigate = useNavigate();
  } catch {
    // Graceful fallback if rendered outside BrowserRouter
  }

  // Load remembered credentials on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(REMEMBER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.password) setPassword(parsed.password);
        if (parsed.firstName) setFirstName(parsed.firstName);
        if (parsed.lastName) setLastName(parsed.lastName);
        setRememberPassword(true);
      }
    } catch {
      // Storage access gracefully handled
    }
  }, []);

  const toggleMode = (targetMode: 'signup' | 'login') => {
    setMode(targetMode);
    setError(null);
    if (navigate) {
      navigate(targetMode === 'signup' ? '/signup' : '/login');
    }
  };

  const handleToggleRemember = () => {
    const nextVal = !rememberPassword;
    setRememberPassword(nextVal);
    if (!nextVal) {
      try {
        localStorage.removeItem(REMEMBER_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  const handleGoogleDemo = () => {
    setEmail('alex.s@aurora.io');
    setPassword('AuroraPass2026!');
    setFirstName('Alex');
    setLastName('Sterling');
    setRememberPassword(true);
    setError(null);
  };

  const handleGithubDemo = () => {
    setEmail('operator@bottlingplant.local');
    setPassword('SecurePlant2026!');
    setFirstName('Plant');
    setLastName('Operator');
    setRememberPassword(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please provide all required fields.');
      return;
    }

    if (mode === 'signup' && password.length < 8) {
      setError('Password requires at least 8 symbols.');
      return;
    }

    // Persist or wipe remembered credentials based on checkbox
    try {
      if (rememberPassword) {
        localStorage.setItem(
          REMEMBER_STORAGE_KEY,
          JSON.stringify({
            email,
            password,
            firstName,
            lastName,
            timestamp: Date.now(),
          })
        );
      } else {
        localStorage.removeItem(REMEMBER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        if (authContext?.login) {
          await authContext.login(email, password);
        }
      } else {
        const fullName = `${firstName} ${lastName}`.trim() || 'Aurora Operator';
        if (authContext?.signup) {
          await authContext.signup(fullName, email, password, password);
        }
      }

      if (navigate) {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full bg-black selection:bg-white/30 p-2 transition-all duration-500 lg:h-screen lg:overflow-hidden lg:p-4 font-sans text-white">
      {/* ── Left Column (Hero & Background Video) ── */}
      <section className="hidden lg:flex w-[52%] relative flex-col items-center justify-end pb-32 px-12 rounded-3xl overflow-hidden shadow-2xl h-full group/hero">
        {/* Background Video (NO dark overlay, gradient, or tint mask) */}
        <video
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 ease-out group-hover/hero:scale-105"
          autoPlay
          muted
          loop
          playsInline
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"
            type="video/mp4"
          />
        </video>

        {/* Back Button linking to Homepage with Spring Hover */}
        {navigate ? (
          <motion.button
            type="button"
            onClick={() => navigate('/')}
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(0,0,0,0.65)' }}
            whileTap={{ scale: 0.92 }}
            className="absolute top-6 left-6 z-20 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white backdrop-blur-md transition-colors cursor-pointer border border-white/10"
            title="Back to Home"
            aria-label="Back to Home"
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>
        ) : (
          <motion.a
            href="/"
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(0,0,0,0.65)' }}
            whileTap={{ scale: 0.92 }}
            className="absolute top-6 left-6 z-20 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white backdrop-blur-md transition-colors cursor-pointer border border-white/10"
            title="Back to Home"
            aria-label="Back to Home"
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.a>
        )}

        {/* Hero Content Container with Staggered Reveal */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.15,
                delayChildren: 0.2,
              },
            },
          }}
          className="z-10 w-full max-w-xs space-y-8"
        >
          {/* Brand / Logo */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
            }}
            className="flex items-center justify-center gap-2 select-none"
          >
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
            >
              <Circle className="w-4 h-4 fill-white text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
            </motion.div>
            <span className="text-xl font-bold tracking-widest text-white">PULSE</span>
          </motion.div>

          {/* Heading Block with AnimatePresence */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
            }}
            className="text-center space-y-2 select-none"
          >
            <AnimatePresence mode="wait">
              <motion.h1
                key={mode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="text-4xl font-medium tracking-tight whitespace-nowrap"
              >
                {mode === 'signup' ? 'Join PULSE Network' : 'Access PULSE Portal'}
              </motion.h1>
            </AnimatePresence>
            <p className="text-white/60 text-sm leading-relaxed px-4">
              Follow these 3 steps to activate your operator workstation.
            </p>
          </motion.div>

          {/* Steps with Interactive State & Spring Transitions */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
            }}
            className="space-y-3 w-full"
          >
            <StepItem
              number={1}
              text={mode === 'signup' ? 'Register operator identity' : 'Authenticate operator identity'}
              active={activeStep === 1}
              onClick={() => setActiveStep(1)}
            />
            <StepItem
              number={2}
              text={mode === 'signup' ? 'Configure plant workstation' : 'Synchronize station telemetry'}
              active={activeStep === 2}
              onClick={() => setActiveStep(2)}
            />
            <StepItem
              number={3}
              text={mode === 'signup' ? 'Authorize security clearance' : 'Launch SCADA control center'}
              active={activeStep === 3}
              onClick={() => setActiveStep(3)}
            />
          </motion.div>
        </motion.div>
      </section>

      {/* ── Right Column (Sign Up / Sign In Form) ── */}
      <section className="flex-1 flex flex-col items-center justify-center py-12 lg:py-6 px-4 sm:px-12 lg:px-16 xl:px-24 overflow-y-auto lg:overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-xl space-y-8 lg:space-y-6 sm:space-y-10"
        >
          {/* Header with AnimatePresence */}
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="text-center space-y-2 select-none"
            >
              <h2 className="text-3xl font-medium tracking-tight text-white">
                {mode === 'signup' ? 'Create Operator Account' : 'Operator Sign In'}
              </h2>
              <p className="text-white/40 text-sm">
                {mode === 'signup'
                  ? 'Input your operator credentials to initialize access.'
                  : 'Enter your credentials to access live SCADA operations.'}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Animated Error Alert */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between shadow-lg shadow-red-950/20"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-red-400/60 hover:text-red-400 text-base leading-none ml-2 cursor-pointer"
                  aria-label="Dismiss error"
                >
                  &times;
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Social Buttons (2-column grid) with Spring Feedback */}
          <div className="grid grid-cols-2 gap-4">
            <SocialButton icon={Chrome} label="Google" onClick={handleGoogleDemo} />
            <SocialButton icon={Github} label="Github" onClick={handleGithubDemo} />
          </div>

          {/* Divider with Subtle Line */}
          <div className="relative flex items-center justify-center select-none">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <span className="relative bg-black px-4 text-xs font-medium text-white/40 uppercase tracking-widest">
              Or
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Smooth Accordion-like Expansion for First/Last Name in Signup Mode */}
            <AnimatePresence initial={false}>
              {mode === 'signup' && (
                <motion.div
                  key="signup-name-fields"
                  initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
                  exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="grid grid-cols-2 gap-4 pb-1">
                    <InputGroup
                      label="First Name"
                      placeholder="ex. Alex"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required={mode === 'signup'}
                    />
                    <InputGroup
                      label="Last Name"
                      placeholder="ex. Sterling"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required={mode === 'signup'}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <InputGroup
              label="Email"
              placeholder="operator@bottlingplant.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {/* Password input with Eye toggle */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white">Password</label>
              <div className="relative flex items-center group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-brand-gray border border-transparent group-hover:border-white/10 rounded-xl h-11 px-4 pr-11 text-white placeholder:text-white/20 focus:border-white/25 focus:ring-2 focus:ring-white/20 outline-none transition-all text-sm"
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 text-white/40 hover:text-white transition-colors cursor-pointer p-0.5"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </motion.button>
              </div>
              <span className="text-xs text-white/40">Requires at least 8 characters.</span>
            </div>

            {/* ── Modern Animated "Remember Password" Checkbox ── */}
            <div className="flex items-center justify-between pt-1 select-none">
              <label
                onClick={handleToggleRemember}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <motion.div
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className={`w-4 h-4 rounded-md flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    rememberPassword
                      ? 'bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.45)]'
                      : 'bg-brand-gray border border-white/25 group-hover:border-white/60'
                  }`}
                  role="checkbox"
                  aria-checked={rememberPassword}
                >
                  <AnimatePresence>
                    {rememberPassword && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 28 }}
                      >
                        <Check className="w-3 h-3 stroke-[3.5]" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                <span className="text-xs text-white/60 group-hover:text-white transition-colors font-medium">
                  Remember password
                </span>
              </label>


            </div>

            {/* Submit Button with Luminous Glow & Spring Press */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{
                scale: 1.012,
                boxShadow: '0 0 28px rgba(255,255,255,0.28)',
              }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 450, damping: 25 }}
              className="w-full h-14 bg-white text-black font-semibold rounded-xl mt-4 cursor-pointer shadow-lg disabled:opacity-50 text-sm flex items-center justify-center overflow-hidden relative"
            >
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.span
                    key="loading-indicator"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="inline-flex items-center justify-center gap-2"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </motion.span>
                ) : (
                  <motion.span
                    key={mode}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    {mode === 'signup' ? 'Create Operator Account' : 'Sign In to Plant'}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </form>

          {/* Footer Link with Smooth Mode Toggle */}
          <div className="text-center pt-2">
            <AnimatePresence mode="wait">
              {mode === 'signup' ? (
                <motion.p
                  key="footer-signup"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="text-sm text-white/40"
                >
                  Already have plant credentials?{' '}
                  <button
                    type="button"
                    onClick={() => toggleMode('login')}
                    className="text-white hover:underline font-medium cursor-pointer transition-colors"
                  >
                    Sign in
                  </button>
                </motion.p>
              ) : (
                <motion.p
                  key="footer-login"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="text-sm text-white/40"
                >
                  New plant operator?{' '}
                  <button
                    type="button"
                    onClick={() => toggleMode('signup')}
                    className="text-white hover:underline font-medium cursor-pointer transition-colors"
                  >
                    Register account
                  </button>
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </section>
    </main>
  );
}

/* ══════════════════════════════════════════════════════════════
   REUSABLE COMPONENTS
   ══════════════════════════════════════════════════════════════ */

/**
 * 1. <StepItem>
 * Takes number, text, and an optional active boolean.
 * - Active: bg-white text-black border border-white. Number circle: bg-black text-white.
 * - Inactive: bg-brand-gray text-white border-none. Number circle: bg-white/10 text-white/40.
 */
export function StepItem({
  number,
  text,
  active = false,
  onClick,
}: {
  number: number;
  text: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 450, damping: 25 }}
      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-300 cursor-pointer ${
        active
          ? 'bg-white text-black border border-white shadow-[0_0_24px_rgba(255,255,255,0.22)]'
          : 'bg-brand-gray text-white border border-transparent hover:border-white/15'
      }`}
    >
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors ${
          active ? 'bg-black text-white' : 'bg-white/10 text-white/40'
        }`}
      >
        {number}
      </span>
      <span className="text-sm font-medium tracking-tight truncate">{text}</span>
    </motion.div>
  );
}

/**
 * 2. <SocialButton>
 * Takes icon and label. Button has bg-black border border-white/10 rounded-xl hover:bg-white/5.
 */
export function SocialButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{
        scale: 1.02,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderColor: 'rgba(255,255,255,0.24)',
      }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 450, damping: 25 }}
      className="w-full h-12 flex items-center justify-center gap-2.5 bg-black border border-white/10 rounded-xl transition-all cursor-pointer text-sm font-medium text-white shadow-sm"
    >
      <Icon className="w-5 h-5 text-white flex-shrink-0" />
      <span>{label}</span>
    </motion.button>
  );
}

/**
 * 3. <InputGroup>
 * Takes label, placeholder, and type.
 * Label: text-sm font-medium text-white.
 * Input: bg-brand-gray border-none rounded-xl h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20.
 */
export function InputGroup({
  label,
  placeholder,
  type,
  value,
  onChange,
  name,
  required,
}: {
  label: string;
  placeholder: string;
  type: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 w-full group">
      <label className="text-sm font-medium text-white">{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full bg-brand-gray border border-transparent group-hover:border-white/10 rounded-xl h-11 px-4 text-white placeholder:text-white/20 focus:border-white/25 focus:ring-2 focus:ring-white/20 outline-none transition-all text-sm"
      />
    </div>
  );
}

/**
 * Brand SVG Icons for Chrome (Google) and Github
 */
export const Chrome: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" />
    <line x1="21.17" y1="8" x2="12" y2="8" />
    <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
    <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
  </svg>
);

export const Github: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);
