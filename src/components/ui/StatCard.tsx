import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { themeClasses, getIconColorClasses } from '@/utils/themeUtils.util';

interface StatCardProps {
  label: string;
  value: string | number | React.ReactNode;
  icon: LucideIcon;
  iconColor: 'blue' | 'green' | 'purple' | 'red' | 'yellow' | 'orange';
}

export const StatCard = React.memo<StatCardProps>(({
  label,
  value,
  icon: Icon,
  iconColor
}) => (
  <div className={themeClasses.statCard}>
    <div className={themeClasses.statCardContent}>
      <div>
        <p className={themeClasses.statLabel}>{label}</p>
        <p className={themeClasses.statValue}>{value}</p>
      </div>
      <Icon className={`${themeClasses.iconLarge} ${getIconColorClasses(iconColor)}`} />
    </div>
  </div>
));
