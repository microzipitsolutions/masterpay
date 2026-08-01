import { useState } from "react";
import api from "../api";

function CreateAgent() {
  const [form, setForm] = useState({
    name: "",
    commission_percent: "",
    max_payment_limit: "",
    min_transaction_amount: "",
    username: "",
    password: "",
    is_active: true,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const maxLimit = Number(form.max_payment_limit || 0);
    const minAmount = Number(form.min_transaction_amount || 0);

    if (maxLimit < 0 || minAmount < 0) {
      alert("Limits cannot be negative");
      return;
    }

    if (maxLimit && minAmount > maxLimit) {
      alert("Minimum transaction amount cannot be greater than max payment limit");
      return;
    }

    await api.post("/api/agents", form);
    alert("Agent created successfully");
    setForm({
      name: "",
      commission_percent: "",
      max_payment_limit: "",
      min_transaction_amount: "",
      username: "",
      password: "",
      is_active: true,
    });
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-8">
      <h1 className="text-4xl font-bold mb-8 text-[#2B7DE9]">Admin Agent Form</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block mb-2 font-medium">Name *</label>
          <input name="name" value={form.name} onChange={handleChange} required placeholder="Agent Name" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:border-[#2B7DE9] outline-none" />
        </div>

        <div>
          <label className="block mb-2 font-medium">Commission Percent *</label>
          <input name="commission_percent" value={form.commission_percent} onChange={handleChange} required type="number" step="0.01" min="0" max="100" placeholder="e.g 6" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:border-[#2B7DE9] outline-none" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block mb-2 font-medium">Max Payment Limit *</label>
            <input name="max_payment_limit" value={form.max_payment_limit} onChange={handleChange} required type="number" min="0" placeholder="e.g 100000" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:border-[#2B7DE9] outline-none" />
          </div>

          <div>
            <label className="block mb-2 font-medium">Min Transaction Amount *</label>
            <input name="min_transaction_amount" value={form.min_transaction_amount} onChange={handleChange} required type="number" min="0" placeholder="e.g 500" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:border-[#2B7DE9] outline-none" />
          </div>
        </div>

        <div>
          <label className="block mb-2 font-medium">Username *</label>
          <input name="username" value={form.username} onChange={handleChange} required placeholder="Username" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:border-[#2B7DE9] outline-none" />
        </div>

        <div>
          <label className="block mb-2 font-medium">Password *</label>
          <input name="password" value={form.password} onChange={handleChange} required type="password" placeholder="Password" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:border-[#2B7DE9] outline-none" />
        </div>

        <label className="flex items-center gap-3">
          <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="w-5 h-5" />
          Is Active
        </label>

        <button className="bg-[#2B7DE9] hover:bg-[#0b2a5b] text-white px-8 py-3 rounded-xl font-semibold">Save Agent</button>
      </form>
    </div>
  );
}

export default CreateAgent;
