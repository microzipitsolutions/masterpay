import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import api from "../api";
import Logo from "../components/Logo";
import { useBranding } from "../context/BrandingContext";
import { validateSignupForm } from "../utils/signupValidation";

function Signup() {
  const navigate = useNavigate();
  const { theme_color } = useBranding();

  const [role, setRole] = useState("merchant");
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
        role,
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
      <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center px-4">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center">
          <div className="mb-6">
            <Logo />
          </div>
          <p className="text-gray-700 font-semibold mb-2">Account created successfully!</p>
          <p className="text-gray-500 text-sm">Redirecting you to login…</p>
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
        <p className="text-gray-500 mb-6 sm:mb-8">Create your account</p>

        <div className="mb-6 flex rounded-xl border border-gray-200 p-1">
          <button
            type="button"
            onClick={() => setRole("merchant")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
              role === "merchant" ? "text-white" : "text-gray-600"
            }`}
            style={role === "merchant" ? { backgroundColor: theme_color } : {}}
          >
            Merchant
          </button>
          <button
            type="button"
            onClick={() => setRole("agent")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
              role === "agent" ? "text-white" : "text-gray-600"
            }`}
            style={role === "agent" ? { backgroundColor: theme_color } : {}}
          >
            Agent
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Full name / business name"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#dbe7f5] focus:border-[#2B7DE9] text-base"
            required
          />
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
              placeholder="Password (min 6 characters)"
              type={showPassword ? "text" : "password"}
              minLength={6}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-[#dbe7f5] focus:border-[#2B7DE9]"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#dbe7f5] rounded"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
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
              className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-[#dbe7f5] focus:border-[#2B7DE9]"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#dbe7f5] rounded"
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <button
            disabled={loading}
            className="w-full text-white py-3 rounded-xl font-semibold disabled:opacity-60"
            style={{ backgroundColor: theme_color }}
          >
            {loading ? "Creating account..." : `Sign up as ${role === "merchant" ? "Merchant" : "Agent"}`}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold" style={{ color: theme_color }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;
