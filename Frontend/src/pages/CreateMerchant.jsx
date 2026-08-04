import { useEffect, useState } from "react";
import api from "../api";

function CreateMerchant() {
  const [agents, setAgents] = useState([]);

  const [form, setForm] = useState({
    name: "",
    commission_percent: "",
    agent_ids: [],
    username: "",
    password: "",
    is_active: true,
  });

  useEffect(() => {
    api.get("/api/agents")
      .then((res) => setAgents(Array.isArray(res.data) ? res.data : []));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const toggleAgent = (id) => {
    setForm((prev) => {
      const exists = prev.agent_ids.includes(id);
      return {
        ...prev,
        agent_ids: exists
          ? prev.agent_ids.filter((a) => a !== id)
          : [...prev.agent_ids, id],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    await api.post("/api/merchants", form);

    alert("Merchant created successfully");

    setForm({
      name: "",
      commission_percent: "",
      agent_ids: [],
      username: "",
      password: "",
      is_active: true,
    });
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-8">
      <h1 className="text-4xl font-bold mb-8">Merchant Form</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block mb-2 font-medium">Name *</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            placeholder="Merchant Name"
            className="w-full border border-gray-300 rounded-xl px-4 py-3"
          />
        </div>

        <div>
          <label className="block mb-2 font-medium">Commission Percent *</label>
          <input
            name="commission_percent"
            value={form.commission_percent}
            onChange={handleChange}
            required
            type="number"
            placeholder="e.g 2.5"
            className="w-full border border-gray-300 rounded-xl px-4 py-3"
          />
        </div>

        <div>
          <label className="block mb-2 font-medium">
            Assign Agents <span className="text-sm font-normal text-gray-500">(optional — leave unassigned to manage this merchant directly from Admin; payins balance across selected agents that still have available limit)</span>
          </label>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-300 p-2 space-y-1">
            {agents.length === 0 && (
              <p className="px-2 py-1 text-sm text-gray-400">No agents found</p>
            )}
            {agents.map((agent) => (
              <label
                key={agent.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={form.agent_ids.includes(agent.id)}
                  onChange={() => toggleAgent(agent.id)}
                  className="w-5 h-5"
                />
                <span>{agent.name}</span>
              </label>
            ))}
          </div>
          {form.agent_ids.length > 0 && (
            <p className="mt-1 text-sm text-gray-500">
              {form.agent_ids.length} agent{form.agent_ids.length > 1 ? "s" : ""} selected
            </p>
          )}
        </div>

        <div>
          <label className="block mb-2 font-medium">Username *</label>
          <input
            name="username"
            value={form.username}
            onChange={handleChange}
            required
            placeholder="Username"
            className="w-full border border-gray-300 rounded-xl px-4 py-3"
          />
        </div>

        <div>
          <label className="block mb-2 font-medium">Password *</label>
          <input
            name="password"
            value={form.password}
            onChange={handleChange}
            required
            type="password"
            placeholder="Password"
            className="w-full border border-gray-300 rounded-xl px-4 py-3"
          />
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="is_active"
            checked={form.is_active}
            onChange={handleChange}
            className="w-5 h-5"
          />
          Is Active
        </label>

        <button className="bg-[#2B7DE9] text-white px-8 py-3 rounded-xl font-semibold">
          Save Merchant
        </button>
      </form>
    </div>
  );
}

export default CreateMerchant;