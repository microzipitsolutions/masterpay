import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { clearSession, getCurrentSession, roleHomePath } from "../api";
import Logo from "../components/Logo";
import { useBranding } from "../context/BrandingContext";

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
      <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center px-4">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="mb-6">
            <Logo />
          </div>
          <p className="text-gray-600 mb-6">
            You are already logged in as <b>{existingSession.role || "user"}</b>.
            Please logout first to login as another role in this browser.
          </p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate(roleHomePath(existingSession.role))}
              className="w-full text-white py-3 rounded-xl font-semibold"
              style={{ backgroundColor: theme_color }}
            >
              Go to Dashboard
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-50"
            >
              Logout and Login as Another Role
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="mb-6">
          <Logo />
        </div>
        <p className="text-gray-500 mb-6 sm:mb-8">Login to your account</p>

        <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
          <input
            name="username"
            value={form.username}
            onChange={handleChange}
            placeholder="Username"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#dbe7f5] focus:border-[#2B7DE9] text-base"
            required
          />
          <div className="relative">
            <input
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-[#dbe7f5] focus:border-[#2B7DE9]"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <button
            disabled={loading}
            className="w-full text-white py-3 rounded-xl font-semibold disabled:opacity-60"
            style={{ backgroundColor: theme_color }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-semibold" style={{ color: theme_color }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
