import { useState, useEffect, useCallback } from 'react';
import { useId } from 'react';
import { Row, Col, Card, Table, Typography, Progress, Select, Statistic, Spin, Alert, Flex } from 'antd';
import type { TableProps } from 'antd';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getLoanUsage } from '../../../api/reports';
import { listTeams } from '../../../api/teams';
import type { LoanUsageReport, CoachSummary } from '../../../api/reports';
import type { Team } from '../../../api/teams';

const { Text } = Typography;

export default function LoanAnalysisTab() {
  const gradientId = `loanGradient-${useId()}`;
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [loanUsage, setLoanUsage] = useState<LoanUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLoanUsage = useCallback((tid: string | undefined) => {
    setLoading(true);
    setError(null);
    getLoanUsage(tid ? { team_id: tid } : undefined)
      .then(data => setLoanUsage(data))
      .catch(() => setError('Failed to load loan data. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    listTeams().then(r => setTeams(r.data)).catch(() => {});
    fetchLoanUsage(undefined);
  }, [fetchLoanUsage]);

  function handleTeamChange(val: string | undefined) {
    setTeamId(val);
    fetchLoanUsage(val);
  }

  const maxLoanCount = loanUsage?.top_assets.reduce((m, a) => Math.max(m, a.loan_count), 1) ?? 1;

  const coachColumns: TableProps<CoachSummary>['columns'] = [
    { title: 'Coach',        dataIndex: 'name',         key: 'name' },
    { title: 'Total Loans',  dataIndex: 'loan_count',   key: 'loan_count',   width: 110 },
    { title: 'Active Loans', dataIndex: 'active_loans', key: 'active_loans', width: 110 },
  ];

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 200 }}>
        <Spin />
      </Flex>
    );
  }

  if (error || !loanUsage) {
    return <Alert type="error" message={error ?? 'Failed to load loan data.'} />;
  }

  return (
    <div>
      {/* Team Filter */}
      {teams.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="All Teams"
            style={{ width: 240 }}
            value={teamId}
            options={teams.map(t => ({ value: t.id, label: `${t.name} (${t.age_group} ${t.gender})` }))}
            onChange={val => handleTeamChange(val)}
          />
        </div>
      )}

      {/* Team Summary Cards — only when a team is selected */}
      {loanUsage.team_summary && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: 12, border: 'none' }}>
              <Statistic title="Total Loans" value={loanUsage.team_summary.total_loans} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: 12, border: 'none' }}>
              <Statistic
                title="Active Loans"
                value={loanUsage.team_summary.active_loans}
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: 12, border: 'none' }}>
              <Statistic
                title="Overdue Loans"
                value={loanUsage.team_summary.overdue_loans}
                valueStyle={{ color: loanUsage.team_summary.overdue_loans > 0 ? '#ff4d4f' : undefined }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Monthly Loan Trend */}
      <Card
        title="Monthly Loan Trend (Past 6 Months)"
        style={{ borderRadius: 12, border: 'none', marginBottom: 20 }}
      >
        {loanUsage.monthly_trend.length === 0 ? (
          <Text type="secondary">No loan data in the past 6 months</Text>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={loanUsage.monthly_trend}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#1677ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#1677ff" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="loan_count"
                stroke="#1677ff"
                fill={`url(#${gradientId})`}
                name="Loans"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Top Borrowed Assets" style={{ borderRadius: 12, border: 'none' }}>
            {loanUsage.top_assets.length === 0 ? (
              <Text type="secondary">No loan data</Text>
            ) : (
              <div>
                {loanUsage.top_assets.map((asset, i) => (
                  <div key={asset.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text>
                        <Text type="secondary" style={{ marginRight: 8 }}>#{i + 1}</Text>
                        {asset.name}
                      </Text>
                      <Text strong>{asset.loan_count} loans</Text>
                    </div>
                    <Progress
                      percent={Math.round((asset.loan_count / maxLoanCount) * 100)}
                      showInfo={false}
                      strokeColor="#1677ff"
                      size="small"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Loan Activity by Coach" style={{ borderRadius: 12, border: 'none' }}>
            <Table<CoachSummary>
              dataSource={loanUsage.coach_summary}
              columns={coachColumns}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 400 }}
              locale={{ emptyText: 'No coach activity' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
