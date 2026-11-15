import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Factory,
  Layers,
  CheckCircle2,
  ShieldCheck,
  Package,
  Activity,
  History,
  FileBarChart,
} from 'lucide-react';

interface CategoryItem {
  id: string;
  label: string;
  to: string;
  icon: React.ReactNode;
}

export const CategoryNavigation: React.FC = () => {
  const categories: CategoryItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      to: '/dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'production',
      label: 'Production',
      to: '/dashboard/production',
      icon: <Factory className="w-4 h-4" />,
    },
    {
      id: 'bottle-tracking',
      label: 'Bottle Tracking',
      to: '/dashboard/bottle-tracking',
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: 'inspection',
      label: 'Inspection',
      to: '/dashboard/inspection',
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    {
      id: 'capping',
      label: 'Capping',
      to: '/dashboard/capping',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    {
      id: 'packaging',
      label: 'Packaging',
      to: '/dashboard/packaging',
      icon: <Package className="w-4 h-4" />,
    },
    {
      id: 'sensors',
      label: 'Sensors',
      to: '/dashboard/sensors',
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: 'history',
      label: 'History',
      to: '/dashboard/history',
      icon: <History className="w-4 h-4" />,
    },
    {
      id: 'reports',
      label: 'Reports',
      to: '/dashboard/reports',
      icon: <FileBarChart className="w-4 h-4" />,
    },
  ];

  return (
    <nav className="w-full overflow-x-auto pb-2 scrollbar-none">
      <div className="flex items-center gap-2 p-1.5 rounded-full glass-panel w-fit max-w-full">
        {categories.map((cat) => (
          <NavLink
            key={cat.id}
            to={cat.to}
            end={cat.to === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap select-none ${
                isActive
                  ? 'bg-[rgba(83,211,226,0.22)] border border-[rgba(83,211,226,0.6)] text-[#53D3E2] shadow-[0_0_16px_rgba(83,211,226,0.25)]'
                  : 'text-[#9EB3C9] hover:text-[#EDF4FA] hover:bg-[rgba(160,185,210,0.14)] border border-transparent'
              }`
            }
          >
            <span className="flex-shrink-0">{cat.icon}</span>
            <span>{cat.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
