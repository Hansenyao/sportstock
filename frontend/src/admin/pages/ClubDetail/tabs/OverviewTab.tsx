// frontend/src/admin/pages/ClubDetail/tabs/OverviewTab.tsx
import { Row, Col, Card, Descriptions, Tag, Button, Statistic, Typography, App } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { updateClubStatus, resetClubAdminPassword } from '../../../api/admin';
import type { ClubDetail } from '../../../api/admin';

const { Text } = Typography;

interface Props {
  club: ClubDetail;
  onRefresh: () => void;
}

export default function OverviewTab({ club, onRefresh }: Props) {
  const { message, modal } = App.useApp();
  const [disabling,  setDisabling]  = useState(false);
  const [resetting,  setResetting]  = useState(false);

  const handleToggleStatus = () => {
    const action = club.is_active ? 'disable' : 'enable';
    modal.confirm({
      title: `${club.is_active ? 'Disable' : 'Enable'} Club`,
      icon: <ExclamationCircleOutlined />,
      content: club.is_active
        ? `Disabling "${club.name}" will prevent all its members from logging in.`
        : `Re-enabling "${club.name}" will restore access for all its members.`,
      okText: action.charAt(0).toUpperCase() + action.slice(1),
      okButtonProps: { danger: club.is_active },
      onOk: async () => {
        setDisabling(true);
        try {
          await updateClubStatus(club.id, !club.is_active);
          message.success(`Club ${action}d successfully`);
          onRefresh();
        } catch {
          message.error(`Failed to ${action} club`);
        } finally {
          setDisabling(false);
        }
      },
    });
  };

  const handleResetAdminPassword = () => {
    modal.confirm({
      title: 'Reset Admin Password',
      content: `Generate a new temporary password for the admin account of "${club.name}"? You will need to share it with them.`,
      onOk: async () => {
        setResetting(true);
        try {
          const { temp_password } = await resetClubAdminPassword(club.id);
          modal.info({
            title: 'Temporary Password',
            content: (
              <div>
                <Text>Share this password with the club admin:</Text>
                <br />
                <Text code copyable style={{ fontSize: 16, marginTop: 8, display: 'block' }}>
                  {temp_password}
                </Text>
              </div>
            ),
          });
          onRefresh();
        } catch {
          message.error('Failed to reset admin password');
        } finally {
          setResetting(false);
        }
      },
    });
  };

  return (
    <Row gutter={16}>
      {/* Club Info */}
      <Col xs={24} md={8}>
        <Card
          style={{ background: '#1a1a1a', border: '1px solid #252525', height: '100%' }}
          styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
        >
          <Text style={{ color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 12 }}>
            Club Info
          </Text>
          <Descriptions column={1} size="small" style={{ flex: 1 }}>
            <Descriptions.Item label="Name">{club.name}</Descriptions.Item>
            <Descriptions.Item label="Sport">{club.sport_type ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{club.contact_email}</Descriptions.Item>
            <Descriptions.Item label="Address">{club.address ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Created">{new Date(club.created_at).toLocaleDateString()}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={club.is_active ? 'success' : 'error'}>{club.is_active ? 'Active' : 'Disabled'}</Tag>
            </Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #252525' }}>
            <Button
              danger={club.is_active}
              block
              loading={disabling}
              onClick={handleToggleStatus}
            >
              {club.is_active ? 'Disable Club' : 'Enable Club'}
            </Button>
          </div>
        </Card>
      </Col>

      {/* Club Admin Account */}
      <Col xs={24} md={8}>
        <Card
          style={{ background: '#1a1a1a', border: '1px solid #252525', height: '100%' }}
          styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
        >
          <Text style={{ color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 12 }}>
            Club Admin Account
          </Text>
          {club.admin_account ? (
            <>
              <Descriptions column={1} size="small" style={{ flex: 1 }}>
                <Descriptions.Item label="Name">{club.admin_account.name}</Descriptions.Item>
                <Descriptions.Item label="Email">{club.admin_account.email}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={club.admin_account.is_active ? 'success' : 'error'}>
                    {club.admin_account.is_active ? 'Active' : 'Disabled'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Verified">
                  {club.admin_account.email_verified ? 'Yes' : 'No'}
                </Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #252525' }}>
                <Button block loading={resetting} onClick={handleResetAdminPassword}>
                  Reset Admin Password
                </Button>
              </div>
            </>
          ) : (
            <Text style={{ color: '#555' }}>No club admin found.</Text>
          )}
        </Card>
      </Col>

      {/* Quick Stats */}
      <Col xs={24} md={8}>
        <Card style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
          <Text style={{ color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 12 }}>
            Quick Stats
          </Text>
          <Row gutter={[12, 12]}>
            {[
              { label: 'Users',        value: club.stats.user_count,         color: '#1668dc' },
              { label: 'Assets',       value: club.stats.asset_count,        color: '#52c41a' },
              { label: 'Active Loans', value: club.stats.active_loan_count,  color: '#faad14' },
              { label: 'Overdue',      value: club.stats.overdue_loan_count, color: '#ff4d4f' },
            ].map(s => (
              <Col span={12} key={s.label}>
                <Statistic
                  title={<span style={{ color: '#555', fontSize: 11 }}>{s.label}</span>}
                  value={s.value}
                  valueStyle={{ color: s.color, fontSize: 22 }}
                />
              </Col>
            ))}
          </Row>
        </Card>
      </Col>
    </Row>
  );
}
