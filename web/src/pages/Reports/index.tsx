import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, Badge, Spin, Flex, Alert, Typography } from 'antd';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSummary, getDepreciation, getAlerts, getMovements, getRecentMovements,
  type SummaryReport, type DepreciationReport, type AlertsReport,
  type MovementSummary, type RecentMovement,
} from '../../api/reports';
import { getMyClub, type Club } from '../../api/clubs';
import OverviewTab from '../Analytics/tabs/OverviewTab';
import AlertsTab from '../Analytics/tabs/AlertsTab';
import LoanAnalysisTab from '../Analytics/tabs/LoanAnalysisTab';
import StockMovementsTab from '../Analytics/tabs/StockMovementsTab';

const { Title } = Typography;

interface PageData {
  summary: SummaryReport;
  depreciation: DepreciationReport;
  alerts: AlertsReport;
  movements: MovementSummary[];
  recentMovements: RecentMovement[];
  club: Club;
}

export default function ReportsPage() {
  const { user, activeClub } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && activeClub?.role !== 'club_admin' && activeClub?.role !== 'asset_manager' && activeClub?.role !== 'accountant') {
      setLoading(false);
      navigate('/dashboard', { replace: true });
      return;
    }

    async function load() {
      try {
        const [summary, depreciation, alerts, movements, recentMovements, club] =
          await Promise.all([
            getSummary(),
            getDepreciation(),
            getAlerts(),
            getMovements(),
            getRecentMovements(),
            getMyClub(),
          ]);
        setData({ summary, depreciation, alerts, movements, recentMovements, club });
      } catch {
        setError('Failed to load reports data. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, activeClub, navigate]);

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
      children: <LoanAnalysisTab />,
    },
    {
      key: 'movements',
      label: 'Stock Movements',
      children: <StockMovementsTab movements={data.movements} recentMovements={data.recentMovements} />,
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20, marginTop: 0 }}>Reports</Title>
      <Tabs items={tabItems} defaultActiveKey="overview" />
    </div>
  );
}
