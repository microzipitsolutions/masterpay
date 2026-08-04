// import { useEffect, useMemo, useState } from "react";
// import api from "../api";
// import { Pencil, Trash2, Search, X, Eye, EyeOff, Copy } from "lucide-react";
// import { useNavigate } from "react-router-dom";

// function Merchants() {

//   const navigate = useNavigate();

// const goToMerchantDashboard = (merchant) => {
//   localStorage.setItem(
//     "rdpay_view_as",
//     JSON.stringify({
//       role: "merchant",
//       id: merchant.id,
//       name: merchant.name,
//     })
//   );

//   navigate("/merchant-dashboard");
// };
//   const [merchants, setMerchants] = useState([]);
//   const [agents, setAgents] = useState([]);
//   const [search, setSearch] = useState("");
//   const [showPassword, setShowPassword] = useState(false);

//   const [editingMerchant, setEditingMerchant] = useState(null);
//   const [viewingMerchant, setViewingMerchant] = useState(null);

//   const viewAs = JSON.parse(localStorage.getItem("rdpay_view_as") || "{}");

//   const [editForm, setEditForm] = useState({
//     name: "",
//     description: "",
//     commission_percent: "",
//     agent_id: "",
//     username: "",
//     password: "",
//     is_active: true,
//   });

//   const fetchMerchants = async () => {
//     const res = await api.get("/api/merchants");
//     setMerchants(res.data || []);
//   };

//   const fetchAgents = async () => {
//     const res = await api.get("/api/agents");
//     setAgents(res.data || []);
//   };

//   useEffect(() => {
//     fetchMerchants();
//     fetchAgents();
//   }, []);

//   const filteredMerchants = useMemo(() => {
//     return merchants.filter((merchant) =>
//       (merchant.name || "").toLowerCase().includes(search.toLowerCase())
//     );
//   }, [merchants, search]);

//   const copyText = async (text) => {
//     try {
//       if (navigator.clipboard && window.isSecureContext) {
//         await navigator.clipboard.writeText(text);
//       } else {
//         const textarea = document.createElement("textarea");
//         textarea.value = text;
//         textarea.style.position = "fixed";
//         textarea.style.left = "-9999px";
//         document.body.appendChild(textarea);
//         textarea.focus();
//         textarea.select();
//         document.execCommand("copy");
//         document.body.removeChild(textarea);
//       }

//       alert("Credentials copied");
//     } catch (error) {
//       console.error("Copy failed:", error);
//       alert("Copy failed");
//     }
//   };

//   const openEditModal = (merchant) => {
//     setEditingMerchant(merchant);

//     setEditForm({
//       name: merchant.name || "",
//       description: merchant.description || "",
//       commission_percent: merchant.commission_percent || "",
//       agent_id: merchant.agent_id || "",
//       username: merchant.username || "",
//       password: "",
//       is_active: merchant.is_active,
//     });
//   };

//   const closeEditModal = () => {
//     setEditingMerchant(null);
//   };

//   const openViewModal = (merchant) => {
//     setViewingMerchant(merchant);
//     setShowPassword(false);
//   };

//   const closeViewModal = () => {
//     setViewingMerchant(null);
//     setShowPassword(false);
//   };

//   const handleEditChange = (e) => {
//     const { name, value, type, checked } = e.target;

//     setEditForm({
//       ...editForm,
//       [name]: type === "checkbox" ? checked : value,
//     });
//   };

//   const updateMerchant = async (e) => {
//     e.preventDefault();

//     await api.put(`/api/merchants/${editingMerchant.id}`, {
//       name: editForm.name,
//       commission_percent: editForm.commission_percent,
//       agent_id: editForm.agent_id || null,
//       username: editForm.username,
//       password: editForm.password,
//       is_active: editForm.is_active,
//     });

//     closeEditModal();
//     fetchMerchants();
//   };

//   const deleteMerchant = async (id) => {
//     const confirmDelete = window.confirm(
//       "Are you sure you want to delete this merchant?"
//     );

//     if (!confirmDelete) return;

//     await api.delete(`/api/merchants/${id}`);
//     fetchMerchants();
//   };

//   const passwordValue =
//     viewingMerchant?.password ||
//     viewingMerchant?.plain_password ||
//     "Password hidden";


//     {localStorage.getItem("rdpay_role") === "admin" && viewAs?.role && (
//   <div className="flex items-center gap-2 border-b bg-white px-6 py-2 text-sm">
//     <span className="rounded-full bg-yellow-100 px-3 py-1 font-semibold text-yellow-700">
//       👤 Viewing As
//     </span>

//     <span className="text-gray-500">
//       Admin
//     </span>

//     <span className="text-gray-300">›</span>

//     <span className="rounded-md bg-blue-50 px-3 py-1 font-semibold text-blue-700">
//       {viewAs.name} · {viewAs.role?.toUpperCase()}
//     </span>
//   </div>
// )}

//   return (
//     <div className="px-8 py-8">
//       <div className="mb-7 flex items-end justify-between gap-6">
//         <h1 className="text-[28px] font-bold text-black">Merchant List</h1>

//         <div className="flex items-end gap-4">
//           <div>
//             <label className="mb-2 block text-sm font-semibold text-[#101936]">
//               Start Date
//             </label>

//             <input
//               type="text"
//               placeholder="Select start date"
//               className="h-[46px] w-[220px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400"
//             />
//           </div>

//           <div>
//             <label className="mb-2 block text-sm font-semibold text-[#101936]">
//               End Date
//             </label>

//             <input
//               type="text"
//               placeholder="Select end date"
//               className="h-[46px] w-[220px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400"
//             />
//           </div>

//           <div>
//             <label className="mb-2 block text-sm font-semibold text-[#101936]">
//               Search
//             </label>

//             <div className="flex gap-2">
//               <input
//                 value={search}
//                 onChange={(e) => setSearch(e.target.value)}
//                 type="text"
//                 placeholder="Search..."
//                 className="h-[46px] w-[205px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400"
//               />

//               <button className="flex h-[46px] w-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white">
//                 <Search size={22} className="text-slate-700" />
//               </button>
//             </div>
//           </div>
//         </div>
//       </div>

//       <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
//         <table className="w-full text-left">
//           <thead>
//             <tr className="border-b border-slate-100">
//               <th className="w-[140px] px-6 py-5 font-bold">ID</th>
//               <th className="px-6 py-5 font-bold">Name</th>
//               <th className="w-[220px] px-6 py-5 font-bold">Is Active</th>
//               <th className="w-[220px] px-6 py-5 font-bold">View</th>
//               <th className="w-[300px] px-6 py-5 font-bold">Action</th>
//             </tr>
//           </thead>

//           <tbody>
//             {filteredMerchants.map((merchant, index) => (
//               <tr
//                 key={merchant.id}
//                 className="border-b border-slate-100 last:border-b-0"
//               >
//                 <td className="px-6 py-5">{index + 1}</td>

//                 <td className="px-6 py-5 font-medium">{merchant.name}</td>

//                 <td className="px-6 py-5">
//                   <span
//                     className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
//                       merchant.is_active
//                         ? "bg-emerald-50 text-emerald-600"
//                         : "bg-red-50 text-red-600"
//                     }`}
//                   >
//                     {merchant.is_active ? "Yes" : "No"}
//                   </span>
//                 </td>

//                 <td className="px-6 py-5">
//                   <button
//                     onClick={() => openViewModal(merchant)}
//                     className="text-[#2B7DE9] underline"
//                   >
//                     View All
//                   </button>
//                 </td>

//                 <td className="px-6 py-5">
//                   <div className="flex items-center gap-3">

//                     <button
//   onClick={() => goToMerchantDashboard(merchant)}
//   className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
// >
//   Dashboard
// </button>
//                     <button
//                       onClick={() => {
//                         const loginText = `username: ${merchant.username}
// password: ${merchant.password || merchant.plain_password || "123456"}
// website: https://masterpay.live/login`;

//                         copyText(loginText);
//                       }}
//                       className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 transition hover:scale-105"
//                     >
//                       <Copy size={18} />
//                     </button>

//                     <button
//                       onClick={() => openEditModal(merchant)}
//                       className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbe7f5] text-[#2B7DE9] transition hover:scale-105"
//                     >
//                       <Pencil size={18} />
//                     </button>

//                     <button
//                       onClick={() => deleteMerchant(merchant.id)}
//                       className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 transition hover:scale-105"
//                     >
//                       <Trash2 size={18} />
//                     </button>
//                   </div>
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>

//         {filteredMerchants.length === 0 && (
//           <p className="p-6 text-gray-500">No merchants found.</p>
//         )}
//       </div>

//       {editingMerchant && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55">
//           <div className="relative max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-[22px] bg-white px-10 py-10 shadow-xl">
//             <button
//               onClick={closeEditModal}
//               className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"
//             >
//               <X size={25} />
//             </button>

//             <form onSubmit={updateMerchant} className="space-y-5">
//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
//                   Name <span className="text-red-500">*</span>
//                 </label>

//                 <input
//                   name="name"
//                   value={editForm.name}
//                   onChange={handleEditChange}
//                   required
//                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
//                 />
//               </div>

//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
//                   Username <span className="text-red-500">*</span>
//                 </label>

//                 <input
//                   name="username"
//                   value={editForm.username}
//                   onChange={handleEditChange}
//                   required
//                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
//                 />
//               </div>

//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
//                   New Password
//                 </label>

//                 <input
//                   name="password"
//                   value={editForm.password}
//                   onChange={handleEditChange}
//                   placeholder="Leave empty to keep old password"
//                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
//                 />
//               </div>

//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
//                   Description
//                 </label>

//                 <textarea
//                   name="description"
//                   value={editForm.description}
//                   onChange={handleEditChange}
//                   placeholder="Optional description"
//                   className="h-[88px] w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none placeholder:text-slate-400"
//                 />
//               </div>

//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
//                   Commission Charge Percent{" "}
//                   <span className="text-red-500">*</span>
//                 </label>

//                 <input
//                   name="commission_percent"
//                   value={editForm.commission_percent}
//                   onChange={handleEditChange}
//                   required
//                   type="number"
//                   step="0.01"
//                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
//                 />
//               </div>

//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
//                   Assign Agent
//                 </label>

//                 <select
//                   name="agent_id"
//                   value={editForm.agent_id}
//                   onChange={handleEditChange}
//                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
//                 >
//                   <option value="">Select Agent</option>
//                   {agents.map((agent) => (
//                     <option key={agent.id} value={agent.id}>
//                       {agent.name}
//                     </option>
//                   ))}
//                 </select>
//               </div>

//               <div className="flex items-center gap-3">
//                 <label className="relative inline-flex cursor-pointer items-center">
//                   <input
//                     type="checkbox"
//                     name="is_active"
//                     checked={editForm.is_active}
//                     onChange={handleEditChange}
//                     className="peer sr-only"
//                   />

//                   <div className="h-7 w-12 rounded-full bg-slate-300 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#2B7DE9] peer-checked:after:translate-x-5"></div>
//                 </label>

//                 <span className="text-sm font-semibold text-[#101936]">
//                   Is Active
//                 </span>
//               </div>

//               <div className="flex justify-end pt-2">
//                 <button className="rounded-lg bg-[#2B7DE9] px-8 py-4 text-sm font-bold text-white">
//                   Save Merchant
//                 </button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}

//       {viewingMerchant && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55">
//           <div className="relative w-full max-w-[520px] rounded-[22px] bg-white px-8 py-8 shadow-xl">
//             <button
//               onClick={closeViewModal}
//               className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
//             >
//               <X size={22} />
//             </button>

//             <h2 className="mb-6 text-2xl font-bold text-black">
//               Merchant Details
//             </h2>

//             <div className="space-y-3 text-sm">
//               <p><b>Name:</b> {viewingMerchant.name}</p>
//               <p><b>Username:</b> {viewingMerchant.username}</p>
//               <p><b>Agent:</b> {viewingMerchant.agent_name || "-"}</p>
//               <p><b>Commission:</b> {viewingMerchant.commission_percent || 0}%</p>
//               <p><b>Status:</b> {viewingMerchant.is_active ? "Active" : "Inactive"}</p>

//               <div className="flex items-center gap-2">
//                 <b>Password:</b>
//                 <span>{showPassword ? passwordValue : "********"}</span>
//                 <button onClick={() => setShowPassword(!showPassword)}>
//                   {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// export default Merchants;


import { useEffect, useMemo, useState } from "react";
import api from "../api";
import {
  Pencil,
  Trash2,
  Search,
  X,
  Eye,
  EyeOff,
  Copy,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

function Merchants() {
  const navigate = useNavigate();

  const goToMerchantDashboard = (merchant) => {
    localStorage.setItem(
      "rdpay_view_as",
      JSON.stringify({
        role: "merchant",
        id: merchant.id,
        name: merchant.name,
      })
    );

    navigate("/merchant-dashboard");
  };

  const [merchants, setMerchants] = useState([]);
  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [editingMerchant, setEditingMerchant] = useState(null);
  const [viewingMerchant, setViewingMerchant] = useState(null);

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    commission_percent: "",
    agent_ids: [],
    username: "",
    password: "",
    is_active: true,
  });

  const fetchMerchants = async () => {
    const res = await api.get("/api/merchants");
    setMerchants(res.data || []);
  };

  const fetchAgents = async () => {
    const res = await api.get("/api/agents");
    setAgents(res.data || []);
  };

  useEffect(() => {
    fetchMerchants();
    fetchAgents();
  }, []);

  const filteredMerchants = useMemo(() => {
    return merchants.filter((merchant) =>
      (merchant.name || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [merchants, search]);

  const copyText = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        document.execCommand("copy");

        document.body.removeChild(textarea);
      }

      alert("Credentials copied");
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Copy failed");
    }
  };

  const openEditModal = (merchant) => {
    setEditingMerchant(merchant);

    const agentIds =
      Array.isArray(merchant.agent_ids) && merchant.agent_ids.length
        ? merchant.agent_ids.map(Number)
        : merchant.agent_id
        ? [Number(merchant.agent_id)]
        : [];

    setEditForm({
      name: merchant.name || "",
      description: merchant.description || "",
      commission_percent: merchant.commission_percent || "",
      agent_ids: agentIds,
      username: merchant.username || "",
      password: "",
      is_active: merchant.is_active,
    });
  };

  const toggleEditAgent = (id) => {
    setEditForm((prev) => {
      const exists = prev.agent_ids.includes(id);
      return {
        ...prev,
        agent_ids: exists
          ? prev.agent_ids.filter((a) => a !== id)
          : [...prev.agent_ids, id],
      };
    });
  };

  const closeEditModal = () => {
    setEditingMerchant(null);
  };

  const openViewModal = (merchant) => {
    setViewingMerchant(merchant);
    setShowPassword(false);
  };

  const closeViewModal = () => {
    setViewingMerchant(null);
    setShowPassword(false);
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;

    setEditForm({
      ...editForm,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const updateMerchant = async (e) => {
    e.preventDefault();

    await api.put(`/api/merchants/${editingMerchant.id}`, {
      name: editForm.name,
      commission_percent: editForm.commission_percent,
      agent_ids: editForm.agent_ids,
      username: editForm.username,
      password: editForm.password,
      is_active: editForm.is_active,
    });

    closeEditModal();
    fetchMerchants();
  };

  const deleteMerchant = async (id) => {
    const confirmDelete = window.confirm(
      "Delete this merchant?\n\nThis will PERMANENTLY delete the merchant AND all its merchants, transactions and settlements. This cannot be undone."
    );

    if (!confirmDelete) return;

    try {
      await api.delete(`/api/merchants/${id}`);
      fetchMerchants();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not delete merchant");
    }
  };

  const passwordValue =
    viewingMerchant?.password ||
    viewingMerchant?.plain_password ||
    "Password hidden";

  return (
    <div className="p-4 md:p-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
        <h1 className="text-[28px] font-bold text-black">
          Merchant List
        </h1>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#101936]">
              Start Date
            </label>

            <input
              type="text"
              placeholder="Select start date"
              className="h-[46px] w-full sm:w-[220px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-[#101936]">
              End Date
            </label>

            <input
              type="text"
              placeholder="Select end date"
              className="h-[46px] w-full sm:w-[220px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-[#101936]">
              Search
            </label>

            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Search..."
                className="h-[46px] w-full sm:w-[205px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400"
              />

              <button className="flex h-[46px] w-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white">
                <Search size={22} className="text-slate-700" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="w-[140px] px-6 py-5 font-bold">
                ID
              </th>

              <th className="px-6 py-5 font-bold">
                Name
              </th>

              <th className="w-[220px] px-6 py-5 font-bold">
                Is Active
              </th>

              <th className="w-[220px] px-6 py-5 font-bold">
                View
              </th>

              <th className="w-[300px] px-6 py-5 font-bold">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredMerchants.map((merchant, index) => (
              <tr
                key={merchant.id}
                className="border-b border-slate-100 last:border-b-0"
              >
                <td className="px-6 py-5">
                  {index + 1}
                </td>

                <td className="px-6 py-5 font-medium">
                  {merchant.name}
                </td>

                <td className="px-6 py-5">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                      merchant.is_active
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {merchant.is_active ? "Yes" : "No"}
                  </span>
                </td>

                <td className="px-6 py-5">
                  <button
                    onClick={() => openViewModal(merchant)}
                    className="text-[#2B7DE9] underline"
                  >
                    View All
                  </button>
                </td>

                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">

                    <button
                      onClick={() =>
                        goToMerchantDashboard(merchant)
                      }
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Dashboard
                    </button>

                    <button
                      onClick={() => {
                        const loginText = `username: ${merchant.username}
password: ${
                          merchant.password ||
                          merchant.plain_password ||
                          "123456"
                        }
website: ${window.location.origin}/login`;

                        copyText(loginText);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 transition hover:scale-105"
                    >
                      <Copy size={18} />
                    </button>

                    <button
                      onClick={() =>
                        openEditModal(merchant)
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbe7f5] text-[#2B7DE9] transition hover:scale-105"
                    >
                      <Pencil size={18} />
                    </button>

                    <button
                      onClick={() =>
                        deleteMerchant(merchant.id)
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 transition hover:scale-105"
                    >
                      <Trash2 size={18} />
                    </button>

                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredMerchants.length === 0 && (
          <p className="p-6 text-gray-500">
            No merchants found.
          </p>
        )}
      </div>

      {editingMerchant && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/55">
          <div className="relative max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white px-5 sm:px-10 py-8 sm:py-10 shadow-xl">

            <button
              onClick={closeEditModal}
              className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            >
              <X size={25} />
            </button>

            <form
              onSubmit={updateMerchant}
              className="space-y-5"
            >

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#101936]">
                  Name <span className="text-red-500">*</span>
                </label>

                <input
                  name="name"
                  value={editForm.name}
                  onChange={handleEditChange}
                  required
                  className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#101936]">
                  Username <span className="text-red-500">*</span>
                </label>

                <input
                  name="username"
                  value={editForm.username}
                  onChange={handleEditChange}
                  required
                  className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#101936]">
                  New Password
                </label>

                <input
                  name="password"
                  value={editForm.password}
                  onChange={handleEditChange}
                  placeholder="Leave empty to keep old password"
                  className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#101936]">
                  Description
                </label>

                <textarea
                  name="description"
                  value={editForm.description}
                  onChange={handleEditChange}
                  placeholder="Optional description"
                  className="h-[88px] w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#101936]">
                  Commission Charge Percent{" "}
                  <span className="text-red-500">*</span>
                </label>

                <input
                  name="commission_percent"
                  value={editForm.commission_percent}
                  onChange={handleEditChange}
                  required
                  type="number"
                  step="0.01"
                  className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#101936]">
                  Assign Agents{" "}
                  <span className="font-normal text-slate-500">
                    (optional — leave unassigned to manage directly from Admin; payins balance across selected agents with available limit)
                  </span>
                </label>

                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2">
                  {agents.length === 0 && (
                    <p className="px-2 py-1 text-sm text-slate-400">No agents found</p>
                  )}
                  {agents.map((agent) => (
                    <label
                      key={agent.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={editForm.agent_ids.includes(Number(agent.id))}
                        onChange={() => toggleEditAgent(Number(agent.id))}
                        className="h-5 w-5"
                      />
                      <span className="text-sm">{agent.name}</span>
                    </label>
                  ))}
                </div>
                {editForm.agent_ids.length > 0 && (
                  <p className="mt-1 text-sm text-slate-500">
                    {editForm.agent_ids.length} agent
                    {editForm.agent_ids.length > 1 ? "s" : ""} selected
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex cursor-pointer items-center">

                  <input
                    type="checkbox"
                    name="is_active"
                    checked={editForm.is_active}
                    onChange={handleEditChange}
                    className="peer sr-only"
                  />

                  <div className="h-7 w-12 rounded-full bg-slate-300 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#2B7DE9] peer-checked:after:translate-x-5"></div>

                </label>

                <span className="text-sm font-semibold text-[#101936]">
                  Is Active
                </span>
              </div>

              <div className="flex justify-end pt-2">
                <button className="rounded-lg bg-[#2B7DE9] px-8 py-4 text-sm font-bold text-white">
                  Save Merchant
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {viewingMerchant && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/55">

          <div className="relative w-full max-w-[520px] rounded-t-2xl sm:rounded-2xl bg-white px-5 sm:px-8 py-6 sm:py-8 shadow-xl">

            <button
              onClick={closeViewModal}
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            >
              <X size={22} />
            </button>

            <h2 className="mb-6 text-2xl font-bold text-black">
              Merchant Details
            </h2>

            <div className="space-y-3 text-sm">

              <p>
                <b>Name:</b> {viewingMerchant.name}
              </p>

              <p>
                <b>Username:</b> {viewingMerchant.username}
              </p>

              <p>
                <b>Agent:</b>{" "}
                {viewingMerchant.agent_name || "-"}
              </p>

              <p>
                <b>Commission:</b>{" "}
                {viewingMerchant.commission_percent || 0}%
              </p>

              <p>
                <b>Status:</b>{" "}
                {viewingMerchant.is_active
                  ? "Active"
                  : "Inactive"}
              </p>

              <div className="flex items-center gap-2">
                <b>Password:</b>

                <span>
                  {showPassword
                    ? passwordValue
                    : "********"}
                </span>

                <button
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                >
                  {showPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Merchants;