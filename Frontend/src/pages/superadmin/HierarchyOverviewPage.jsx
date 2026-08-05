import SuperAdminLayout from "../../layouts/SuperAdminLayout";
import HierarchyOverview from "../../components/superadmin/HierarchyOverview";

export default function HierarchyOverviewPage() {
  return (
    <SuperAdminLayout>
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Hierarchy Overview</h1>
        <p className="text-sm text-gray-500 mb-4">
          Drill down from Client → Admin → Agent/Merchant. Click a row to expand.
        </p>
        <HierarchyOverview />
      </div>
    </SuperAdminLayout>
  );
}
