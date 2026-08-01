// // import { useEffect, useMemo, useState } from "react";
// // import api from "../api";
// // import { Pencil, Trash2, Search, X, Copy } from "lucide-react";
// // import { useNavigate } from "react-router-dom";
// // function Agents() {

// //   const navigate = useNavigate();

// // const goToAgentDashboard = (agent) => {
// //   localStorage.setItem(
// //     "rdpay_view_as",
// //     JSON.stringify({
// //       role: "agent",
// //       id: agent.id,
// //       name: agent.name,
// //     })
// //   );

// //   navigate(`/agent-dashboard?viewAgentId=${agent.id}&viewAgentName=${encodeURIComponent(agent.name)}`);
// // };
// //   const [agents, setAgents] = useState([]);
// //   const [search, setSearch] = useState("");
// //   const [editingAgent, setEditingAgent] = useState(null);

// //   const [editForm, setEditForm] = useState({
// //     name: "",
// //     description: "",
// //     commission_percent: "",
// //     max_available_limit: "",
// //     max_payment_limit: "",
// //     min_transaction_amount: "",
// //     username: "",
// //     password: "",
// //     is_active: true,
// //   });

// //   const fetchAgents = async () => {
// //     const res = await api.get("/api/agents");
// //     setAgents(res.data || []);
// //   };

// //   useEffect(() => {
// //     fetchAgents();
// //   }, []);

// //   const filteredAgents = useMemo(() => {
// //     return agents.filter((agent) =>
// //       (agent.name || "").toLowerCase().includes(search.toLowerCase())
// //     );
// //   }, [agents, search]);

// //   const openEditModal = (agent) => {
// //     setEditingAgent(agent);

// //     setEditForm({
// //       name: agent.name || "",
// //       description: agent.description || "",
// //       commission_percent: agent.commission_percent || "",
// //       max_available_limit: agent.max_available_limit || "",
// //       max_payment_limit: agent.max_payment_limit || "",
// //       min_transaction_amount:
// //         agent.min_transaction_amount ||
// //         "",
// //       username: agent.username || "",
// //       password: "",
// //       is_active: agent.is_active,
// //     });
// //   };

// //   const closeEditModal = () => {
// //     setEditingAgent(null);
// //   };

// //   const handleEditChange = (e) => {
// //     const { name, value, type, checked } = e.target;

// //     setEditForm({
// //       ...editForm,
// //       [name]: type === "checkbox" ? checked : value,
// //     });
// //   };

// //   const updateAgent = async (e) => {
// //     e.preventDefault();

// //     await api.put(`/api/agents/${editingAgent.id}`, {
// //       name: editForm.name,
// //       description: editForm.description,
// //       commission_percent: editForm.commission_percent,
// //       max_available_limit: editForm.max_available_limit,
// //       max_payment_limit: editForm.max_payment_limit,
// //       min_transaction_amount: editForm.min_transaction_amount,
// //       min_transaction_amount: editForm.min_transaction_amount,
// //       username: editForm.username,
// //       password: editForm.password,
// //       is_active: editForm.is_active,
// //     });

// //     closeEditModal();
// //     fetchAgents();
// //   };

// //   const deleteAgent = async (id) => {
// //     const confirmDelete = window.confirm(
// //       "Are you sure you want to delete this agent?"
// //     );

// //     if (!confirmDelete) return;

// //     await api.delete(`/api/agents/${id}`);
// //     fetchAgents();
// //   };

// //   const copyText = async (text) => {
// //     try {
// //       if (navigator.clipboard && window.isSecureContext) {
// //         await navigator.clipboard.writeText(text);
// //       } else {
// //         const textarea = document.createElement("textarea");
// //         textarea.value = text;
// //         textarea.style.position = "fixed";
// //         textarea.style.left = "-9999px";
// //         document.body.appendChild(textarea);
// //         textarea.focus();
// //         textarea.select();
// //         document.execCommand("copy");
// //         document.body.removeChild(textarea);
// //       }

// //       alert("Credentials copied");
// //     } catch (error) {
// //       console.error("Copy failed:", error);
// //       alert("Copy failed");
// //     }
// //   };

// //   return (
// //     <div className="px-8 py-8">
// //       <div className="mb-7 flex items-end justify-between gap-6">
// //         <h1 className="text-[28px] font-bold text-black">Agents List</h1>

// //         <div className="flex items-end gap-4">
// //           <div>
// //             <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //               Start Date
// //             </label>

// //             <input
// //               type="text"
// //               placeholder="Select start date"
// //               className="h-[46px] w-[220px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400"
// //             />
// //           </div>

// //           <div>
// //             <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //               End Date
// //             </label>

// //             <input
// //               type="text"
// //               placeholder="Select end date"
// //               className="h-[46px] w-[220px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400"
// //             />
// //           </div>

// //           <div>
// //             <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //               Search
// //             </label>

// //             <div className="flex gap-2">
// //               <input
// //                 value={search}
// //                 onChange={(e) => setSearch(e.target.value)}
// //                 type="text"
// //                 placeholder="Search..."
// //                 className="h-[46px] w-[205px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400"
// //               />

// //               <button className="flex h-[46px] w-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white">
// //                 <Search size={22} className="text-slate-700" />
// //               </button>
// //             </div>
// //           </div>
// //         </div>
// //       </div>

// //       <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
// //         <table className="w-full text-left">
// //           <thead>
// //             <tr className="border-b border-slate-100">
// //               <th className="w-[140px] px-6 py-5 text-base font-bold text-black">
// //                 ID
// //               </th>

// //               <th className="px-6 py-5 text-base font-bold text-black">
// //                 Name
// //               </th>

// //               <th className="px-6 py-5 text-base font-bold text-black">Max Limit</th>
// //               <th className="px-6 py-5 text-base font-bold text-black">Min Amount</th>
// //               <th className="w-[180px] px-6 py-5 text-base font-bold text-black">Is Active</th>

// //               <th className="w-[300px] px-6 py-5 text-base font-bold text-black">
// //                 Action
// //               </th>
// //             </tr>
// //           </thead>

// //           <tbody>
// //             {filteredAgents.map((agent, index) => (
// //               <tr
// //                 key={agent.id}
// //                 className="border-b border-slate-100 last:border-b-0"
// //               >
// //                 <td className="px-6 py-5 text-base text-black">
// //                   {index + 1}
// //                 </td>

// //                 <td className="px-6 py-5 text-base font-medium text-black">
// //                   {agent.name}
// //                 </td>

// //                 <td className="px-6 py-5 text-base text-black">₹{Number(agent.max_payment_limit || 0).toLocaleString("en-IN")}</td>

// //                 <td className="px-6 py-5 text-base text-black">₹{Number(agent.min_transaction_amount || 0).toLocaleString("en-IN")}</td>

// //                 <td className="px-6 py-5">
// //                   <span
// //                     className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
// //                       agent.is_active
// //                         ? "bg-emerald-50 text-emerald-600"
// //                         : "bg-red-50 text-red-600"
// //                     }`}
// //                   >
// //                     {agent.is_active ? "Yes" : "No"}
// //                   </span>
// //                 </td>

// //                 <td className="px-6 py-5">
// //                   <div className="flex items-center gap-3">

// //                     <button
// //   onClick={() => goToAgentDashboard(agent)}
// //   className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
// // >
// //   Dashboard
// // </button>
// //                     <button
// //                       onClick={() => {
// //                         const loginText = `username: ${agent.username}
// // password: ${agent.password || agent.plain_password || "123456"}
// // website: https://masterpay.live/login`;

// //                         copyText(loginText);
// //                       }}
// //                       className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 transition hover:scale-105"
// //                     >
// //                       <Copy size={18} />
// //                     </button>

// //                     <button
// //                       onClick={() => openEditModal(agent)}
// //                       className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbe7f5] text-[#2B7DE9] transition hover:scale-105"
// //                     >
// //                       <Pencil size={18} />
// //                     </button>

// //                     <button
// //                       onClick={() => deleteAgent(agent.id)}
// //                       className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 transition hover:scale-105"
// //                     >
// //                       <Trash2 size={18} />
// //                     </button>
// //                   </div>
// //                 </td>
// //               </tr>
// //             ))}
// //           </tbody>
// //         </table>

// //         {filteredAgents.length === 0 && (
// //           <p className="p-6 text-gray-500">No agents found.</p>
// //         )}
// //       </div>

// //       {editingAgent && (
// //         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55">
// //           <div className="relative max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-[22px] bg-white px-10 py-10 shadow-xl">
// //             <button
// //               onClick={closeEditModal}
// //               className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"
// //             >
// //               <X size={25} />
// //             </button>

// //             <form onSubmit={updateAgent} className="space-y-5">
// //               <div>
// //                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //                   Name <span className="text-red-500">*</span>
// //                 </label>

// //                 <input
// //                   name="name"
// //                   value={editForm.name}
// //                   onChange={handleEditChange}
// //                   required
// //                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
// //                 />
// //               </div>

// //               <div>
// //                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //                   Username <span className="text-red-500">*</span>
// //                 </label>

// //                 <input
// //                   name="username"
// //                   value={editForm.username}
// //                   onChange={handleEditChange}
// //                   required
// //                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
// //                 />
// //               </div>

// //               <div>
// //                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //                   New Password
// //                 </label>

// //                 <input
// //                   name="password"
// //                   value={editForm.password}
// //                   onChange={handleEditChange}
// //                   placeholder="Leave empty to keep old password"
// //                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
// //                 />
// //               </div>

// //               <div>
// //                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //                   Description
// //                 </label>

// //                 <textarea
// //                   name="description"
// //                   value={editForm.description}
// //                   onChange={handleEditChange}
// //                   placeholder="Optional description"
// //                   className="h-[88px] w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none placeholder:text-slate-400"
// //                 />
// //               </div>

// //               <div>
// //                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //                   Commission Charge Percent{" "}
// //                   <span className="text-red-500">*</span>
// //                 </label>

// //                 <input
// //                   name="commission_percent"
// //                   value={editForm.commission_percent}
// //                   onChange={handleEditChange}
// //                   required
// //                   type="number"
// //                   step="0.01"
// //                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
// //                 />
// //               </div>

// //               <div>
// //                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //                   Max Available Limit
// //                 </label>

// //                 <input
// //                   name="max_available_limit"
// //                   value={editForm.max_available_limit}
// //                   onChange={handleEditChange}
// //                   type="number"
// //                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
// //                 />
// //               </div>

// //               <div>
// //                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //                   Max Payment Limit <span className="text-red-500">*</span>
// //                 </label>

// //                 <input
// //                   name="max_payment_limit"
// //                   value={editForm.max_payment_limit}
// //                   onChange={handleEditChange}
// //                   type="number"
// //                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
// //                 />
// //               </div>

// //               <div>
// //                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
// //                   Minimum Transaction Amount{" "}
// //                   <span className="text-red-500">*</span>
// //                 </label>

// //                 <input
// //                   name="min_transaction_amount"
// //                   value={editForm.min_transaction_amount}
// //                   onChange={handleEditChange}
// //                   type="number"
// //                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
// //                 />
// //               </div>

// //               <div className="flex items-center gap-3">
// //                 <label className="relative inline-flex cursor-pointer items-center">
// //                   <input
// //                     type="checkbox"
// //                     name="is_active"
// //                     checked={editForm.is_active}
// //                     onChange={handleEditChange}
// //                     className="peer sr-only"
// //                   />

// //                   <div className="h-7 w-12 rounded-full bg-slate-300 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#2B7DE9] peer-checked:after:translate-x-5"></div>
// //                 </label>

// //                 <span className="text-sm font-semibold text-[#101936]">
// //                   Is Active
// //                 </span>
// //               </div>

// //               <div className="flex justify-end pt-2">
// //                 <button className="rounded-lg bg-[#2B7DE9] px-8 py-4 text-sm font-bold text-white">
// //                   Save Agent
// //                 </button>
// //               </div>
// //             </form>
// //           </div>
// //         </div>
// //       )}
// //     </div>
// //   );
// // }

// // export default Agents;



// import { useEffect, useMemo, useState } from "react";
// import api from "../api";
// import { Pencil, Trash2, Search, X, Copy } from "lucide-react";
// import { useNavigate } from "react-router-dom";

// function Agents() {
//   const navigate = useNavigate();

//   const goToAgentDashboard = (agent) => {
//     localStorage.setItem(
//       "rdpay_view_as",
//       JSON.stringify({
//         role: "agent",
//         id: agent.id,
//         name: agent.name,
//       })
//     );

//     navigate(
//       `/agent-dashboard?viewAgentId=${agent.id}&viewAgentName=${encodeURIComponent(
//         agent.name
//       )}`
//     );
//   };

//   const [agents, setAgents] = useState([]);
//   const [search, setSearch] = useState("");
//   const [editingAgent, setEditingAgent] = useState(null);

//   const [editForm, setEditForm] = useState({
//     name: "",
//     description: "",
//     commission_percent: "",
//     max_available_limit: "",
//     max_payment_limit: "",
//     min_transaction_amount: "",
//     username: "",
//     password: "",
//     is_active: true,
//   });

//   const fetchAgents = async () => {
//     const res = await api.get("/api/agents");
//     setAgents(res.data || []);
//   };

//   useEffect(() => {
//     fetchAgents();
//   }, []);

//   const filteredAgents = useMemo(() => {
//     return agents.filter((agent) =>
//       (agent.name || "").toLowerCase().includes(search.toLowerCase())
//     );
//   }, [agents, search]);

//   const openEditModal = (agent) => {
//     setEditingAgent(agent);

//     setEditForm({
//       name: agent.name || "",
//       description: agent.description || "",
//       commission_percent: agent.commission_percent ?? 0,
//       max_available_limit: agent.max_available_limit ?? 0,
//       max_payment_limit: agent.max_payment_limit ?? 0,
//       min_transaction_amount: agent.min_transaction_amount ?? 0,
//       username: agent.username || "",
//       password: "",
//       is_active: Boolean(agent.is_active),
//     });
//   };

//   const closeEditModal = () => {
//     setEditingAgent(null);
//   };

//   const handleEditChange = (e) => {
//     const { name, value, type, checked } = e.target;

//     setEditForm({
//       ...editForm,
//       [name]: type === "checkbox" ? checked : value,
//     });
//   };

//   const updateAgent = async (e) => {
//     e.preventDefault();

//     try {
//       await api.put(`/api/agents/${editingAgent.id}`, {
//         name: editForm.name,
//         description: editForm.description,
//         commission_percent: editForm.commission_percent,
//         max_available_limit: editForm.max_available_limit,
//         max_payment_limit: editForm.max_payment_limit,
//         min_transaction_amount: editForm.min_transaction_amount,
//         username: editForm.username,
//         password: editForm.password,
//         is_active: editForm.is_active,
//       });

//       alert("Agent updated successfully");

//       closeEditModal();
//       fetchAgents();
//     } catch (error) {
//       alert(error.response?.data?.message || "Could not update agent");
//     }
//   };

//   const deleteAgent = async (id) => {
//     const confirmDelete = window.confirm(
//       "Are you sure you want to delete this agent?"
//     );

//     if (!confirmDelete) return;

//     await api.delete(`/api/agents/${id}`);
//     fetchAgents();
//   };

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

//   return (
//     <div className="px-8 py-8">
//       <div className="mb-7 flex items-end justify-between gap-6">
//         <h1 className="text-[28px] font-bold text-black">Agents List</h1>

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

//               <button className="flex h-[46px] w-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white cursor-pointer">
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
//               <th className="w-[140px] px-6 py-5 text-base font-bold text-black">
//                 ID
//               </th>
//               <th className="px-6 py-5 text-base font-bold text-black">
//                 Name
//               </th>
//               <th className="px-6 py-5 text-base font-bold text-black">
//                 Max Limit
//               </th>
//               <th className="px-6 py-5 text-base font-bold text-black">
//                 Min Amount
//               </th>
//               <th className="w-[180px] px-6 py-5 text-base font-bold text-black">
//                 Is Active
//               </th>
//               <th className="w-[300px] px-6 py-5 text-base font-bold text-black">
//                 Action
//               </th>
//             </tr>
//           </thead>

//           <tbody>
//             {filteredAgents.map((agent, index) => (
//               <tr
//                 key={agent.id}
//                 className="border-b border-slate-100 last:border-b-0"
//               >
//                 <td className="px-6 py-5 text-base text-black">{index + 1}</td>

//                 <td className="px-6 py-5 text-base font-medium text-black">
//                   {agent.name}
//                 </td>

//                 <td className="px-6 py-5 text-base text-black">
//                   ₹{Number(agent.max_payment_limit || 0).toLocaleString("en-IN")}
//                 </td>

//                 <td className="px-6 py-5 text-base text-black">
//                   ₹
//                   {Number(agent.min_transaction_amount || 0).toLocaleString(
//                     "en-IN"
//                   )}
//                 </td>

//                 <td className="px-6 py-5">
//                   <span
//                     className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
//                       agent.is_active
//                         ? "bg-emerald-50 text-emerald-600"
//                         : "bg-red-50 text-red-600"
//                     }`}
//                   >
//                     {agent.is_active ? "Yes" : "No"}
//                   </span>
//                 </td>

//                 <td className="px-6 py-5">
//                   <div className="flex items-center gap-3">
//                     <button
//                       onClick={() => goToAgentDashboard(agent)}
//                       className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white cursor-pointer"
//                     >
//                       Dashboard
//                     </button>

//                     <button
//                       onClick={() => {
//                         const loginText = `username: ${agent.username}
// password: ${agent.password || agent.plain_password || "123456"}
// website: https://masterpay.live/login`;

//                         copyText(loginText);
//                       }}
//                       className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 transition hover:scale-105 cursor-pointer"
//                     >
//                       <Copy size={18} />
//                     </button>

//                     <button
//                       onClick={() => openEditModal(agent)}
//                       className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbe7f5] text-[#2B7DE9] transition hover:scale-105 cursor-pointer"
//                     >
//                       <Pencil size={18} />
//                     </button>

//                     <button
//                       onClick={() => deleteAgent(agent.id)}
//                       className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 transition hover:scale-105 cursor-pointer"
//                     >
//                       <Trash2 size={18} />
//                     </button>
//                   </div>
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>

//         {filteredAgents.length === 0 && (
//           <p className="p-6 text-gray-500">No agents found.</p>
//         )}
//       </div>

//       {editingAgent && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55">
//           <div className="relative max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-[22px] bg-white px-10 py-10 shadow-xl">
//             <button
//               onClick={closeEditModal}
//               className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 cursor-pointer"
//             >
//               <X size={25} />
//             </button>

//             <form onSubmit={updateAgent} className="space-y-5">
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
//                   Max Available Limit
//                 </label>

//                 <input
//                   name="max_available_limit"
//                   value={editForm.max_available_limit}
//                   onChange={handleEditChange}
//                   type="number"
//                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
//                 />
//               </div>

//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
//                   Max Payment Limit <span className="text-red-500">*</span>
//                 </label>

//                 <input
//                   name="max_payment_limit"
//                   value={editForm.max_payment_limit}
//                   onChange={handleEditChange}
//                   type="number"
//                   required
//                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
//                 />
//               </div>

//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-[#101936]">
//                   Minimum Transaction Amount{" "}
//                   <span className="text-red-500">*</span>
//                 </label>

//                 <input
//                   name="min_transaction_amount"
//                   value={editForm.min_transaction_amount}
//                   onChange={handleEditChange}
//                   type="number"
//                   required
//                   className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
//                 />
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
//                 <button className="rounded-lg bg-[#2B7DE9] px-8 py-4 text-sm font-bold text-white cursor-pointer">
//                   Save Agent
//                 </button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// export default Agents;





import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { Pencil, Trash2, Search, X, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";

function Agents() {
  const navigate = useNavigate();

  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState("");
  const [editingAgent, setEditingAgent] = useState(null);

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    commission_percent: "",
    max_available_limit: "",
    max_payment_limit: "",
    min_transaction_amount: "",
    username: "",
    password: "",
    is_active: true,
  });

  const goToAgentDashboard = (agent) => {
    localStorage.setItem(
      "rdpay_view_as",
      JSON.stringify({
        role: "agent",
        id: agent.id,
        name: agent.name,
      })
    );

    navigate(
      `/agent-dashboard?viewAgentId=${agent.id}&viewAgentName=${encodeURIComponent(
        agent.name
      )}`
    );
  };

  const fetchAgents = async () => {
    const res = await api.get("/api/agents");
    setAgents(Array.isArray(res.data) ? res.data : []);
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) =>
      (agent.name || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [agents, search]);

  // Live limit usage. Cap = max_payment_limit (0 = unlimited). Outstanding is
  // approved+in-flight payins minus approved settlements (server-computed).
  // "low" when <=10% of the cap is left; "exhausted" when nothing is left.
  const LIMIT_ALERT_PCT = 0.1;
  const limitInfo = (agent) => {
    const limit = Number(agent.max_payment_limit || 0);
    const outstanding = Number(agent.outstanding_amount || 0);
    if (limit <= 0)
      return { unlimited: true, limit, outstanding, available: Infinity, usedPct: 0, level: "ok" };
    const available = limit - outstanding;
    const usedPct = Math.min(100, Math.max(0, (outstanding / limit) * 100));
    let level = "ok";
    if (available <= 0) level = "exhausted";
    else if (available <= limit * LIMIT_ALERT_PCT) level = "low";
    return { unlimited: false, limit, outstanding, available, usedPct, level };
  };

  const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

  const lowAgents = useMemo(
    () =>
      agents
        .filter((a) => a.is_active)
        .map((a) => ({ agent: a, info: limitInfo(a) }))
        .filter(({ info }) => info.level === "low" || info.level === "exhausted"),
    [agents]
  );

  const openEditModal = (agent) => {
    setEditingAgent(agent);

    setEditForm({
      name: agent.name || "",
      description: agent.description || "",
      commission_percent: agent.commission_percent ?? "",
      max_available_limit: agent.max_available_limit ?? "",
      max_payment_limit: agent.max_payment_limit ?? "",
      min_transaction_amount: agent.min_transaction_amount ?? "",
      username: agent.username || "",
      password: "",
      is_active: Boolean(agent.is_active),
    });
  };

  const closeEditModal = () => {
    setEditingAgent(null);
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;

    setEditForm({
      ...editForm,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const updateAgent = async (e) => {
    e.preventDefault();

    try {
      await api.put(`/api/agents/${editingAgent.id}`, {
        name: editForm.name,
        description: editForm.description,
        commission_percent: editForm.commission_percent,
        max_available_limit: editForm.max_available_limit,
        max_payment_limit: editForm.max_payment_limit,
        min_transaction_amount: editForm.min_transaction_amount,
        username: editForm.username,
        password: editForm.password,
        is_active: editForm.is_active,
      });

      alert("Agent updated successfully");
      closeEditModal();
      fetchAgents();
    } catch (error) {
      alert(error.response?.data?.message || "Could not update agent");
    }
  };

  const deleteAgent = async (id) => {
    const confirmDelete = window.confirm(
      "Delete this agent?\n\nThis will PERMANENTLY delete the agent AND all its merchants, agents, merchants and their transactions. This cannot be undone."
    );

    if (!confirmDelete) return;

    try {
      await api.delete(`/api/agents/${id}`);
      fetchAgents();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not delete agent");
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Credentials copied");
    } catch {
      alert("Copy failed");
    }
  };

  return (
    <div className="p-4 md:p-8">
      {lowAgents.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <p className="mb-2 text-sm font-bold text-amber-800">
            ⚠ {lowAgents.length} agent{lowAgents.length > 1 ? "s are" : " is"} at or near the payin limit
          </p>
          <ul className="space-y-1">
            {lowAgents.map(({ agent, info }) => (
              <li key={agent.id} className="text-sm text-amber-900">
                <span className="font-semibold">{agent.name}</span>{" "}
                {info.level === "exhausted" ? (
                  <span className="font-semibold text-red-600">— limit FULL, no new payins</span>
                ) : (
                  <span>— only {inr(info.available)} left of {inr(info.limit)}</span>
                )}
                . Reassign its merchant to another agent, raise the limit, or add a settlement to free it up.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
        <h1 className="text-[28px] font-bold text-black">Agents List</h1>

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

              <button className="flex h-[46px] w-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white cursor-pointer">
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
              <th className="w-[140px] px-6 py-5 text-base font-bold text-black">
                ID
              </th>
              <th className="px-6 py-5 text-base font-bold text-black">
                Name
              </th>
              <th className="px-6 py-5 text-base font-bold text-black">
                Max Available Limit
              </th>
              <th className="px-6 py-5 text-base font-bold text-black">
                Max Payment Limit
              </th>
              <th className="px-6 py-5 text-base font-bold text-black">
                Available
              </th>
              <th className="px-6 py-5 text-base font-bold text-black">
                Min Amount
              </th>
              <th className="w-[180px] px-6 py-5 text-base font-bold text-black">
                Is Active
              </th>
              <th className="w-[300px] px-6 py-5 text-base font-bold text-black">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredAgents.map((agent, index) => (
              <tr
                key={agent.id}
                className="border-b border-slate-100 last:border-b-0"
              >
                <td className="px-6 py-5 text-base text-black">{index + 1}</td>

                <td className="px-6 py-5 text-base font-medium text-black">
                  {agent.name}
                </td>

                <td className="px-6 py-5 text-base text-black">
                  ₹
                  {Number(agent.max_available_limit || 0).toLocaleString(
                    "en-IN"
                  )}
                </td>

                <td className="px-6 py-5 text-base text-black">
                  ₹
                  {Number(agent.max_payment_limit || 0).toLocaleString("en-IN")}
                </td>

                <td className="px-6 py-5 text-base">
                  {(() => {
                    const info = limitInfo(agent);
                    if (info.unlimited)
                      return <span className="text-slate-400">Unlimited</span>;
                    const color =
                      info.level === "exhausted"
                        ? "bg-red-50 text-red-600"
                        : info.level === "low"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-600";
                    return (
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${color}`}
                      >
                        {info.level === "exhausted" ? "Full" : inr(info.available)}
                      </span>
                    );
                  })()}
                </td>

                <td className="px-6 py-5 text-base text-black">
                  ₹
                  {Number(agent.min_transaction_amount || 0).toLocaleString(
                    "en-IN"
                  )}
                </td>

                <td className="px-6 py-5">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                      agent.is_active
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {agent.is_active ? "Yes" : "No"}
                  </span>
                </td>

                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => goToAgentDashboard(agent)}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white cursor-pointer"
                    >
                      Dashboard
                    </button>

                    <button
                      onClick={() => {
                        const loginText = `username: ${agent.username}
password: ${agent.password || agent.plain_password || "123456"}
website: ${window.location.origin}/login`;

                        copyText(loginText);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 transition hover:scale-105 cursor-pointer"
                    >
                      <Copy size={18} />
                    </button>

                    <button
                      onClick={() => openEditModal(agent)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbe7f5] text-[#2B7DE9] transition hover:scale-105 cursor-pointer"
                    >
                      <Pencil size={18} />
                    </button>

                    <button
                      onClick={() => deleteAgent(agent.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 transition hover:scale-105 cursor-pointer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAgents.length === 0 && (
          <p className="p-6 text-gray-500">No agents found.</p>
        )}
      </div>

      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/55">
          <div className="relative max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white px-5 sm:px-10 py-8 sm:py-10 shadow-xl">
            <button
              onClick={closeEditModal}
              className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 cursor-pointer"
            >
              <X size={25} />
            </button>

            <form onSubmit={updateAgent} className="space-y-5">
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
                  Max Available Limit
                </label>
                <input
                  name="max_available_limit"
                  value={editForm.max_available_limit}
                  onChange={handleEditChange}
                  type="number"
                  className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#101936]">
                  Max Payment Limit <span className="text-red-500">*</span>
                </label>
                <input
                  name="max_payment_limit"
                  value={editForm.max_payment_limit}
                  onChange={handleEditChange}
                  type="number"
                  required
                  className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#101936]">
                  Minimum Transaction Amount{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  name="min_transaction_amount"
                  value={editForm.min_transaction_amount}
                  onChange={handleEditChange}
                  type="number"
                  required
                  className="h-[46px] w-full rounded-lg border border-slate-300 px-4 text-sm outline-none"
                />
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
                <button className="rounded-lg bg-[#2B7DE9] px-8 py-4 text-sm font-bold text-white cursor-pointer">
                  Save Agent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Agents;