import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import api, { clearSession, getCurrentSession, roleHomePath } from "../api";
import Logo from "../components/Logo";
import { useBranding } from "../context/BrandingContext";
import Button from "../components/ui/Button";
import AuthShell from "../components/ui/AuthShell";

function Login() {
  const navigate = useNavigate();
  const existingSession = getCurrentSession();
  const { theme_color } = useBranding();

  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
    window.location.reload();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (existingSession.token) {
      alert("You are already logged in. Please logout first before logging in as another role.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/api/login", form);
      localStorage.setItem("rdpay_token", res.data.token);
      localStorage.setItem("rdpay_user", res.data.username);
      localStorage.setItem("rdpay_role", res.data.role);
      localStorage.setItem("rdpay_user_info", JSON.stringify(res.data));
      navigate(roleHomePath(res.data.role), { replace: true });
    } catch {
      alert("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  if (existingSession.token) {
    return (
      <AuthShell>
        <div className="rounded-card border border-slate-200 bg-white p-6 sm:p-8 shadow-pop">
          <div className="mb-6">
            <Logo />
          </div>
          <p className="text-slate-600 mb-6">
            You are already logged in as <b className="text-navy-900">{existingSession.role || "user"}</b>.
            Please logout first to login as another role in this browser.
          </p>
          <div className="space-y-3">
            <Button className="w-full" onClick={() => navigate(roleHomePath(existingSession.role))}>
              Go to Dashboard
            </Button>
            <Button variant="secondary" className="w-full" onClick={handleLogout}>
              Logout and Login as Another Role
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="rounded-card border border-slate-200 bg-white p-6 sm:p-9 shadow-pop">
        <div className="mb-8">
          <Logo />
        </div>
        <h1 className="text-xl font-bold text-navy-900">Welcome back</h1>
        <p className="text-slate-500 mb-7 mt-1 text-sm">Log in to your account to continue</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-navy-800">Username</label>
            <input
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="Enter your username"
              className="w-full h-12 rounded-control border border-slate-200 px-4 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 text-base"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-navy-800">Password</label>
            <div className="relative">
              <input
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                type={showPassword ? "text" : "password"}
                className="w-full h-12 rounded-control border border-slate-200 px-4 pr-12 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </div>
          <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
            {loading ? "Logging in..." : "Log In"}
          </Button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-semibold" style={{ color: theme_color }}>
            Sign up
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default Login;
