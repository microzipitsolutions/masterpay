import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { Copy, Pencil, Search, Trash2, Plus, X } from "lucide-react";

function Users() {
  const [users, setUsers] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [quickUser, setQuickUser] = useState({
    username: "",
    password: "",
    type: "merchant",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    username: "",
    password: "",
    is_active: true,
  });

  const fetchUsers = async () => {
    try {
      const res = await api.get("/api/users");
      setUsers(res.data || []);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const userType = (user.type || "").toLowerCase();

      const matchesType = typeFilter
        ? userType === typeFilter.toLowerCase()
        : true;

      const matchesSearch =
        (user.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (user.username || "").toLowerCase().includes(search.toLowerCase());

      return matchesType && matchesSearch;
    });
  }, [users, typeFilter, search]);

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

      alert("Login details copied");
    } catch (error) {
      console.log("Copy failed:", error);
      alert("Copy failed");
    }
  };

  const copyLogin = (user) => {
    const loginText = `username: ${user.username}
password: ${user.plain_password || "123456"}
website: ${window.location.origin}/login`;

    copyText(loginText);
  };

  const openEditModal = (user) => {
    setEditingUser(user);

    setEditForm({
      name: user.name || user.username || "",
      username: user.username || "",
      password: "",
      is_active: user.is_active,
    });
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditForm({
      name: "",
      username: "",
      password: "",
      is_active: true,
    });
  };

  const updateUser = async () => {
    if (!editingUser) return;

    try {
      const payload = {
        name: editForm.name,
        username: editForm.username,
        password: editForm.password,
        is_active: editForm.is_active,
        commission_percent: 0,
      };

      if (editingUser.type === "agent") {
        await api.put(`/api/agents/${editingUser.id}`, payload);
      } else if (editingUser.type === "merchant") {
        await api.put(`/api/merchants/${editingUser.id}`, {
          ...payload,
          agent_id: editingUser.agent_id || null,
        });
      } else {
        alert("Admin edit API is not available yet.");
        return;
      }

      alert("User updated successfully");
      closeEditModal();
      fetchUsers();
    } catch (error) {
      console.log(error);
      alert(error.response?.data?.message || "Failed to update user");
    }
  };

  const createQuickUser = async () => {
    if (!quickUser.username || !quickUser.password || !quickUser.type) {
      alert("Please fill username, password and user type");
      return;
    }

    try {
      const commonPayload = {
        name: quickUser.username,
        username: quickUser.username,
        password: quickUser.password,
        commission_percent: 0,
        is_active: true,
      };

      if (quickUser.type === "merchant") {
        await api.post("/api/merchants", {
          ...commonPayload,
          agent_id: null,
        });
      }

      if (quickUser.type === "agent") {
        await api.post("/api/agents", commonPayload);
      }

      if (quickUser.type === "admin") {
        alert("For now, admin users are added manually in database.");
        return;
      }

      alert("User created successfully");

      setQuickUser({
        username: "",
        password: "",
        type: "merchant",
      });

      setShowQuickCreate(false);
      fetchUsers();
    } catch (error) {
      console.log(error);
      alert("Failed to create user");
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-bold text-black">User List</h1>

          <button
            onClick={() => setShowQuickCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2B7DE9] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0b2a5b]"
          >
            <Plus size={14} />
            Create User
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#101936]">
              Select Type
            </label>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-[46px] w-full sm:w-[240px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none"
            >
              <option value="">Search...</option>
              <option value="admin">Admin</option>
              <option value="agent">Agent</option>
              <option value="merchant">Merchant</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-[#101936]">
              Search
            </label>

            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-[46px] w-full sm:w-[205px] rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none"
              />

              <button className="flex h-[46px] w-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white">
                <Search size={22} className="text-slate-700" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showQuickCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-black">
                Quick Create User
              </h2>

              <button
                onClick={() => setShowQuickCreate(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Username
                </label>

                <input
                  value={quickUser.username}
                  onChange={(e) =>
                    setQuickUser({
                      ...quickUser,
                      username: e.target.value,
                    })
                  }
                  placeholder="Enter username"
                  className="h-[48px] w-full rounded-xl border border-slate-300 px-4 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Password
                </label>

                <input
                  value={quickUser.password}
                  onChange={(e) =>
                    setQuickUser({
                      ...quickUser,
                      password: e.target.value,
                    })
                  }
                  placeholder="Enter password"
                  className="h-[48px] w-full rounded-xl border border-slate-300 px-4 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  User Type
                </label>

                <select
                  value={quickUser.type}
                  onChange={(e) =>
                    setQuickUser({
                      ...quickUser,
                      type: e.target.value,
                    })
                  }
                  className="h-[48px] w-full rounded-xl border border-slate-300 px-4 outline-none"
                >
                  <option value="merchant">Merchant</option>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <button
                onClick={createQuickUser}
                className="mt-2 h-[50px] w-full rounded-xl bg-[#2B7DE9] font-semibold text-white hover:bg-[#0b2a5b]"
              >
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-black">Edit User</h2>

              <button
                onClick={closeEditModal}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Name
                </label>

                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      name: e.target.value,
                    })
                  }
                  className="h-[48px] w-full rounded-xl border border-slate-300 px-4 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Username
                </label>

                <input
                  value={editForm.username}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      username: e.target.value,
                    })
                  }
                  className="h-[48px] w-full rounded-xl border border-slate-300 px-4 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  New Password
                </label>

                <input
                  value={editForm.password}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      password: e.target.value,
                    })
                  }
                  placeholder="Leave empty to keep old password"
                  className="h-[48px] w-full rounded-xl border border-slate-300 px-4 outline-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      is_active: e.target.checked,
                    })
                  }
                />

                <span className="text-sm font-semibold">Is Active</span>
              </div>

              <button
                onClick={updateUser}
                className="mt-2 h-[50px] w-full rounded-xl bg-[#2B7DE9] font-semibold text-white hover:bg-[#0b2a5b]"
              >
                Update User
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[700px] text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-6 py-5 font-bold">ID</th>
              <th className="px-6 py-5 font-bold">User Name</th>
              <th className="px-6 py-5 font-bold">Type</th>
              <th className="px-6 py-5 font-bold">Status</th>
              <th className="px-6 py-5 font-bold">Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredUsers.map((user, index) => (
              <tr
                key={`${user.type}-${user.id}`}
                className="border-b border-slate-100"
              >
                <td className="px-6 py-5">{index + 1}</td>

                <td className="px-6 py-5 font-medium">{user.name}</td>

                <td className="px-6 py-5 capitalize">{user.type}</td>

                <td className="px-6 py-5">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                      user.is_active
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {user.is_active ? "Yes" : "No"}
                  </span>
                </td>

                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => copyLogin(user)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600"
                    >
                      <Copy size={18} />
                    </button>

                    <button
                      onClick={() => openEditModal(user)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbe7f5] text-[#2B7DE9]"
                    >
                      <Pencil size={18} />
                    </button>

                    <button className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <p className="p-6 text-gray-500">No users found.</p>
        )}
      </div>
    </div>
  );
}

export default Users;