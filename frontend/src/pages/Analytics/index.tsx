import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, Badge, Spin, Flex, Alert, Typography } from 'antd';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSummary, getDepreciation, getAlerts, getLoanUsage, getMovements, getRecentMovements,
  type SummaryReport, type DepreciationReport, type AlertsReport,
  type LoanUsageReport, type MovementSummary, type RecentMovement,
} from '../../api/reports';
import { getMyClub, type Club } from '../../api/clubs';
import OverviewTab from './tabs/OverviewTab';
import AlertsTab from './tabs/AlertsTab';
import LoanAnalysisTab from './tabs/LoanAnalysisTab';
import StockMovementsTab from './tabs/StockMovementsTab';

const { Title } = Typography;

interface PageData {
  summary: SummaryReport;
  depreciation: DepreciationReport;
  alerts: AlertsReport;
  loanUsage: LoanUsageReport;
  movements: MovementSummary[];
  recentMovements: RecentMovement[];
  club: Club;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'club_admin' && user.role !== 'asset_manager') {
      navigate('/dashboard', { replace: true });
      return;
    }

    async function load() {
      try {
        const [summary, depreciation, alerts, loanUsage, movements, recentMovements, clubRes] =
          await Promise.all([
            getSummary(),
            getDepreciation(),
            getAlerts(),
            getLoanUsage(),
            getMovements(),
            getRecentMovements(),
            getMyClub(),
          ]);
        setData({
          summary, depreciation, alerts, loanUsage, movements, recentMovements,
          club: clubRes.data,
        });
      } catch {
        setError('Failed to load analytics data. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, navigate]);

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 300 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (error || !data) {
    return <Alert type="error" message={error ?? 'Unknown error'} />;
  }

  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      children: <OverviewTab summary={data.summary} depreciation={data.depreciation} />,
    },
    {
      key: 'alerts',
      label: (
        <Badge count={data.alerts.total_alert_count} size="small" offset={[6, -2]}>
          <span style={{ paddingRight: 6 }}>Alerts</span>
        </Badge>
      ),
      children: (
        <AlertsTab
          alerts={data.alerts}
          club={{
            retirement_alert_mode:  data.club.retirement_alert_mode  ?? 'percent',
            retirement_alert_value: data.club.retirement_alert_value ?? 80,
            low_stock_threshold:    data.club.low_stock_threshold    ?? 2,
          }}
        />
      ),
    },
    {
      key: 'loans',
      label: 'Loan Analysis',
      children: <LoanAnalysisTab loanUsage={data.loanUsage} />,
    },
    {
      key: 'movements',
      label: 'Stock Movements',
      children: <StockMovementsTab movements={data.movements} recentMovements={data.recentMovements} />,
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20, marginTop: 0 }}>Analytics</Title>
      <Tabs items={tabItems} defaultActiveKey="overview" />
    </div>
  );
}
