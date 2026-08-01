import React from 'react';
import { themeClasses, getIconColorClasses } from '@/utils/themeUtils.util';
import type { StatCardProps, StatCardGridProps } from '@/types';
import { useShowStatCards } from '@/hooks/useStatCards.hook';

/**
 * A single summary figure.
 *
 * Two layouts, chosen by whether an icon is supplied: the management screens
 * put the figure beside an icon, the report screens stack a label over a
 * coloured figure. Both were hand-written in eight places before this.
 */
export const StatCard = React.memo<StatCardProps>(({
  label,
  value,
  icon: Icon,
  iconColor = 'blue',
  valueColor,
  size = 'default'
}) => {
  const sizeClass = size === 'medium'
    ? themeClasses.statValueMedium
    : size === 'small'
      ? themeClasses.statValueSmall
      : themeClasses.statValue;

  const valueClass = valueColor ? `${sizeClass} ${getIconColorClasses(valueColor)}` : sizeClass;

  if (!Icon) {
    return (
      <div className={themeClasses.statCard}>
        <p className={`${themeClasses.statLabel} mb-2`}>{label}</p>
        <p className={valueClass}>{value}</p>
      </div>
    );
  }

  return (
    <div className={themeClasses.statCard}>
      <div className={themeClasses.statCardContent}>
        <div>
          <p className={themeClasses.statLabel}>{label}</p>
          <p className={valueClass}>{value}</p>
        </div>
        <Icon className={`${themeClasses.iconLarge} ${getIconColorClasses(iconColor)}`} />
      </div>
    </div>
  );
});

StatCard.displayName = 'StatCard';

/**
 * Wraps a row of summary cards and honours the "show summary cards" setting.
 *
 * The check lives here rather than in each screen, so switching the setting
 * off cannot leave one screen still rendering its cards.
 */
export const StatCardGrid: React.FC<StatCardGridProps> = ({ children, className }) => {
  const showStatCards = useShowStatCards();

  if (!showStatCards) {
    return null;
  }

  return <div className={className}>{children}</div>;
};

StatCardGrid.displayName = 'StatCardGrid';
