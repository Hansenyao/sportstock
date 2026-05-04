import { useId } from 'react';
import { Row, Col, Card, Table, Typography, Progress } from 'antd';
import type { TableProps } from 'antd';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { LoanUsageReport, CoachSummary } from '../../../api/reports';

const { Text } = Typography;

interface Props {
  loanUsage: LoanUsageReport;
}

export default function LoanAnalysisTab({ loanUsage }: Props) {
  const gradientId = `loanGradient-${useId()}`;
  const maxLoanCount = loanUsage.top_assets.reduce((m, a) => Math.max(m, a.loan_count), 1);

  const coachColumns: TableProps<CoachSummary>['columns'] = [
    { title: 'Coach',        dataIndex: 'name',        key: 'name' },
    { title: 'Total Loans',  dataIndex: 'loan_count',  key: 'loan_count',  width: 110 },
    { title: 'Active Loans', dataIndex: 'active_loans', key: 'active_loans', width: 110 },
  ];

  return (
    <div>
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
                {/* total_quantity_borrowed intentionally omitted — loan count is the ranking metric here */}
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
