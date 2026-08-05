import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";
import api from "../api";
import Logo from "../components/Logo";
import { useBranding } from "../context/BrandingContext";
import { validateSignupForm } from "../utils/signupValidation";
import Button from "../components/ui/Button";
import AuthShell from "../components/ui/AuthShell";

function Signup() {
  const navigate = useNavigate();
  const { theme_color } = useBranding();

  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const validationError = validateSignupForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/signup", {
        role: "agent",
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password,
      });
      setDone(true);
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1500);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <div className="rounded-card border border-slate-200 bg-white p-6 sm:p-8 text-center shadow-pop">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success">
            <CheckCircle2 size={28} />
          </div>
          <p className="text-navy-900 font-bold mb-1">Account created successfully!</p>
          <p className="text-slate-500 text-sm">Redirecting you to login…</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="rounded-card border border-slate-200 bg-white p-6 sm:p-9 shadow-pop">
        <div className="mb-7">
          <Logo />
        </div>
        <h1 className="text-xl font-bold text-navy-900">Create your account</h1>
        <p className="text-slate-500 mb-6 mt-1 text-sm">Sign up to start accepting and managing payments</p>

        <div className="mb-6 inline-flex items-center rounded-full bg-brand-blue-light px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-blue-dark">
          Agent Signup
        </div>

        {error && (
          <div className="mb-4 rounded-control border border-red-200 bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Full name / business name"
            className="w-full h-12 rounded-control border border-slate-200 px-4 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 text-base"
            required
          />
          <input
            name="username"
            value={form.username}
            onChange={handleChange}
            placeholder="Username"
            className="w-full h-12 rounded-control border border-slate-200 px-4 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 text-base"
            required
          />
          <div className="relative">
            <input
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Password (min 6 characters)"
              type={showPassword ? "text" : "password"}
              minLength={6}
              className="w-full h-12 rounded-control border border-slate-200 px-4 pr-12 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
          <div className="relative">
            <input
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm password"
              type={showConfirmPassword ? "text" : "password"}
              minLength={6}
              className="w-full h-12 rounded-control border border-slate-200 px-4 pr-12 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirmPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
          <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
            {loading ? "Creating account..." : "Sign up as Agent"}
          </Button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold" style={{ color: theme_color }}>
            Log in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default Signup;
